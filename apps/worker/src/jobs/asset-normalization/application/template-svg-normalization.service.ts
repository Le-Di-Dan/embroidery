/**
 * Template SVG derivative production (`APP3-W01B`).
 *
 * The Template SVG counterpart of `NormalizedDerivativeService`, and deliberately
 * a separate service rather than a branch inside it: the raster lane decodes and
 * re-encodes pixels through libvips, and this lane parses and rewrites markup.
 * They share the object write, the deterministic key, the `READY` protocol and
 * the quartet — everything that touches the store or the database — and share no
 * media handling at all, which is what keeps a Sharp option from ever reaching
 * an SVG and a sanitizer option from ever reaching a photograph.
 *
 * Unlike the raster lane this one *buffers*: the source is at most 1 MiB by
 * policy, and an XML tree cannot be validated a chunk at a time. The ceiling is
 * enforced on the stream, so a source that lies about its size is abandoned
 * mid-read rather than read to the end.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Readable, Writable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import {
  buildDerivativeObjectKey,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../../storage/object-storage.provider';
import {
  abortFailure,
  isAbort,
  toRetryableFailure,
} from '../../asset-inspection/application/storage-failure';
import {
  ByteLimitExceededError,
  DigestCounterStream,
} from '../../asset-inspection/infrastructure/streams/digest-counter.stream';
import { normalizationRejection } from '../domain/normalization-outcome';
import {
  TEMPLATE_SVG_LIMITS,
  TEMPLATE_SVG_OUTPUT_POLICY,
  TEMPLATE_SVG_SANITIZATION_POLICY_VERSION,
} from '../domain/svg/template-svg-policy';
import type { NormalizationSourceFacts } from '../domain/repositories/asset-normalization.repository';
import { writeDerivativeObject } from './derivative-object-writer';
import type { NormalizedOutput } from './normalized-derivative.service';
import { sanitizeTemplateSvg } from './template-svg-sanitizer';

@Injectable()
export class TemplateSvgNormalizationService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** The deterministic key for this Asset's sanitized Template SVG. */
  derivativeKey(assetId: string): string {
    return buildDerivativeObjectKey({
      environment: this.environment as ObjectStorageEnvironment,
      assetId,
      derivativeKind: TEMPLATE_SVG_OUTPUT_POLICY.kind,
      contentType: TEMPLATE_SVG_OUTPUT_POLICY.mediaType,
    });
  }

  /**
   * Binds the event's policy version to the sanitizer's (PO-14).
   *
   * Called **before any byte is read**: a job that asked for rules this build
   * does not implement must cost one comparison, not a download followed by a
   * sanitization under the wrong policy. The payload parser already refuses a
   * mismatched version at the runtime boundary; this is the same assertion made
   * where the rules actually live, so the two can never drift apart silently.
   */
  assertPolicyVersion(requested: number): void {
    if (requested !== TEMPLATE_SVG_SANITIZATION_POLICY_VERSION) {
      throw normalizationRejection('TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED');
    }
  }

  /**
   * Verifies the source, sanitizes it and writes the canonical object.
   *
   * Integrity is proven on the same read that feeds the sanitizer, so the bytes
   * that were hashed are the bytes that were parsed — reading twice would leave
   * a window in which the object could change between the two.
   */
  async produce(source: NormalizationSourceFacts, signal: AbortSignal): Promise<NormalizedOutput> {
    const bytes = await this.readVerifiedSource(source, signal);
    const sanitized = sanitizeTemplateSvg(bytes);
    if (sanitized === undefined) {
      throw normalizationRejection('UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG');
    }

    const key = this.derivativeKey(source.assetId);
    const written = await writeDerivativeObject({
      storage: this.storage,
      key,
      contentType: TEMPLATE_SVG_OUTPUT_POLICY.mediaType,
      signal,
      fill: (sink) => streamPipeline(Readable.from([sanitized.bytes]), sink, { signal }),
    });

    return {
      storageKey: key,
      checksum: written.checksum,
      widthPx: sanitized.widthPx,
      heightPx: sanitized.heightPx,
      mediaType: TEMPLATE_SVG_OUTPUT_POLICY.mediaType,
      byteSize: written.byteSize,
    };
  }

  /**
   * Reads the original once, capped, and proves it is the file the row
   * describes.
   *
   * The cap is the recorded size, not the policy ceiling: a stream longer than
   * the row claims is already an integrity failure, and stopping at the recorded
   * length means a lying source never costs more than the row promised.
   */
  private async readVerifiedSource(
    source: NormalizationSourceFacts,
    signal: AbortSignal,
  ): Promise<Buffer> {
    if (source.checksum === null) {
      throw normalizationRejection('NORMALIZATION_SOURCE_INTEGRITY_MISMATCH');
    }
    const expected = Number(source.byteSize);
    if (expected > TEMPLATE_SVG_LIMITS.maxSourceBytes) {
      throw normalizationRejection('NORMALIZATION_SOURCE_TOO_LARGE');
    }

    const counter = new DigestCounterStream({ maxBytes: expected });
    const chunks: Buffer[] = [];
    const stream = await this.openOriginal(source, signal);

    try {
      await streamPipeline(stream, counter, collect(chunks), { signal });
    } catch (error: unknown) {
      if (isAbort(signal, error)) throw abortFailure('source integrity read');
      if (error instanceof ByteLimitExceededError) {
        throw normalizationRejection('NORMALIZATION_SOURCE_INTEGRITY_MISMATCH');
      }
      throw toRetryableFailure('source integrity read', error);
    }

    if (counter.byteSize !== expected || counter.digest() !== source.checksum) {
      throw normalizationRejection('NORMALIZATION_SOURCE_INTEGRITY_MISMATCH');
    }
    return Buffer.concat(chunks);
  }

  private async openOriginal(
    source: NormalizationSourceFacts,
    signal: AbortSignal,
  ): Promise<Readable> {
    try {
      const result = await this.storage.getObjectStream(
        { bucket: 'ORIGINALS', key: source.storageKey },
        signal,
      );
      return result.body;
    } catch (error: unknown) {
      if (isAbort(signal, error)) throw abortFailure('source read');
      throw toRetryableFailure('source read', error);
    }
  }
}

/**
 * A sink that keeps the bytes, bounded by the counter upstream of it.
 *
 * Buffering is safe only because that counter aborts the stream at the recorded
 * size and the policy caps that size at 1 MiB — the collection cannot grow past
 * what was already checked.
 */
function collect(chunks: Buffer[]): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, done): void {
      chunks.push(chunk);
      done();
    },
  });
}
