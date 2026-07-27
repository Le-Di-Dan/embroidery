/**
 * Derivative generation and upload (APP2-W01 §7, §8, §13).
 *
 * One fresh read of the private original per output, decoded and re-encoded
 * through a libvips pipeline whose output is piped straight into managed
 * multipart. No complete original and no complete derivative ever exists as a
 * JavaScript value: there is no `toBuffer`, no temporary file and no base64 —
 * the only buffers in play are the stream chunks in flight, and the digest
 * context that measures them.
 *
 * The measurements written to the record come from the encoder's own `info`
 * event and from a counter on the bytes that actually reached the store, never
 * from what the policy asked for. A pipeline that silently produced something
 * else must be caught here, not discovered on a product page.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import {
  buildAssetPrefix,
  buildDerivativeObjectKey,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../../storage/object-storage.provider';
import type {
  CatalogDerivativeKind,
  DerivativeOutputPolicy,
} from '../domain/asset-processing-policy';
import { contradiction } from '../domain/inspection-contradiction';
import type { InspectedDerivative, InspectedSource } from '../domain/inspection-detail';
import { assetRejection } from '../domain/processing-rejection';
import type { AssetSourceFacts } from '../domain/repositories/asset-inspection.repository';
import { buildDerivativePipeline, captureOutputInfo } from '../infrastructure/image/sharp-pipeline';
import { DigestCounterStream } from '../infrastructure/streams/digest-counter.stream';
import { abortFailure, isAbort, toRetryableFailure } from './storage-failure';

const DERIVATIVE_MEDIA_TYPE = 'image/webp';

/** Which stage of the pipeline failed first. */
type FailureOrigin = 'source' | 'transform' | 'upload';

export type GeneratedDerivative = InspectedDerivative & { readonly storageKey: string };

@Injectable()
export class DerivativeGenerationService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** The deterministic key for one output. Never derived from a filename. */
  derivativeKey(assetId: string, kind: CatalogDerivativeKind): string {
    return buildDerivativeObjectKey({
      environment: this.environment as ObjectStorageEnvironment,
      assetId,
      derivativeKind: kind,
      contentType: DERIVATIVE_MEDIA_TYPE,
    });
  }

  /** This asset's derivative prefix — the only prefix cleanup may touch. */
  derivativePrefix(assetId: string): string {
    return buildAssetPrefix({
      environment: this.environment as ObjectStorageEnvironment,
      scope: 'derivatives',
      assetId,
    });
  }

  async generate(input: {
    readonly source: AssetSourceFacts;
    readonly inspected: InspectedSource;
    readonly policy: DerivativeOutputPolicy;
    readonly signal: AbortSignal;
  }): Promise<GeneratedDerivative> {
    const { source, inspected, policy, signal } = input;
    if (signal.aborted) {
      throw abortFailure('derivative generation');
    }

    const key = this.derivativeKey(source.assetId, policy.kind);
    const body = await this.openOriginal(source, signal);
    const transformer = buildDerivativePipeline(policy);
    const info = captureOutputInfo(transformer);
    const counter = new DigestCounterStream();

    // Which stage broke *first*.
    //
    // Booleans per stream are not enough: every failure here cascades, because
    // `pipeline` destroys the remaining stages with the same error and a dead
    // sink aborts the upload. A decode failure therefore also produces an
    // upload failure, and an upload failure also produces an encoder error —
    // so only the first cause identifies what actually went wrong.
    let origin: FailureOrigin | undefined;
    const note = (stage: FailureOrigin): void => {
      origin ??= stage;
    };
    body.once('error', () => {
      note('source');
    });
    transformer.once('error', () => {
      note('transform');
    });

    // Wrapped in an async thunk so a *synchronous* throw from the port becomes
    // a rejection like every other failure — otherwise it would escape before
    // the handler below is attached and leave the streams open.
    const upload = (async () =>
      this.storage.putObjectStream({
        bucket: 'DERIVATIVES',
        key,
        body: counter,
        contentType: DERIVATIVE_MEDIA_TYPE,
        signal,
      }))();

    let uploadFailure: unknown;
    // Observed immediately: an unattached rejection here would surface as an
    // unhandled rejection and take the whole worker process down.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => {
        note('upload');
        uploadFailure = error;
        // Once the upload is gone nothing will read `counter` again, so the
        // pipeline would sit on backpressure until the attempt timed out.
        // Destroying it turns that stall into an immediate, classifiable
        // failure.
        counter.destroy(error instanceof Error ? error : new Error('derivative upload failed'));
        return error;
      },
    );

    try {
      await streamPipeline(body, transformer, counter, { signal });
    } catch (error: unknown) {
      await settled;
      throw this.classifyPipelineFailure(signal, origin, uploadFailure ?? error);
    }

    const uploadError = await settled;
    if (uploadError !== undefined) {
      if (isAbort(signal, uploadError)) {
        throw abortFailure('derivative upload');
      }
      throw toRetryableFailure('derivative upload', uploadError);
    }

    return this.measure(key, policy, inspected, info.read(), counter);
  }

  /**
   * Decides whether a broken pipeline was the *file* or the *infrastructure*,
   * from whichever stage failed first.
   *
   * Getting this wrong is expensive in both directions: attributing a storage
   * outage to the image writes a permanent verdict about a perfectly good file,
   * and attributing a decode failure to the store retries a corrupt upload to
   * the cap before rejecting it anyway.
   */
  private classifyPipelineFailure(
    signal: AbortSignal,
    origin: FailureOrigin | undefined,
    error: unknown,
  ): Error {
    if (isAbort(signal, error)) {
      return abortFailure('derivative generation');
    }
    if (origin === 'source') {
      return toRetryableFailure('derivative source read', error);
    }
    if (origin === 'upload') {
      return toRetryableFailure('derivative upload', error);
    }
    if (origin === 'transform') {
      // libvips refused the image. The native error stops here: it is not
      // logged, not persisted and not carried as a cause.
      return assetRejection('DECODE_FAILED');
    }
    // No stage claimed it — `pipeline` itself refused (a premature close, for
    // instance). Retryable rather than a verdict, because nothing established
    // that the image is at fault.
    return toRetryableFailure('derivative generation', error);
  }

  private measure(
    storageKey: string,
    policy: DerivativeOutputPolicy,
    inspected: InspectedSource,
    info: { width: number; height: number; size: number } | undefined,
    counter: DigestCounterStream,
  ): GeneratedDerivative {
    if (info === undefined || counter.byteSize === 0) {
      // The upload reported success but the encoder produced nothing. Treated
      // as a contradiction rather than a rejection: it says the pipeline is
      // broken, not that the image is.
      throw contradiction('derivative generation produced no output');
    }
    if (info.width <= 0 || info.height <= 0) {
      throw contradiction('derivative generation reported a degenerate size');
    }
    if (info.width > policy.maxWidth || info.height > policy.maxHeight) {
      throw contradiction('derivative exceeded its bounding box');
    }
    if (info.width > inspected.orientedWidth || info.height > inspected.orientedHeight) {
      // `withoutEnlargement` should make this unreachable. Checked anyway,
      // because upscaling invents detail a customer would read as real.
      throw contradiction('derivative was enlarged beyond the oriented source');
    }

    return {
      kind: policy.kind,
      mediaType: DERIVATIVE_MEDIA_TYPE,
      width: info.width,
      height: info.height,
      byteSize: counter.byteSize,
      checksum: counter.digest(),
      isWatermarked: false,
      storageKey,
    };
  }

  private async openOriginal(source: AssetSourceFacts, signal: AbortSignal): Promise<Readable> {
    try {
      const result = await this.storage.getObjectStream(
        { bucket: 'ORIGINALS', key: source.storageKey },
        signal,
      );
      return result.body;
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('derivative source read');
      }
      throw toRetryableFailure('derivative source read', error);
    }
  }
}
