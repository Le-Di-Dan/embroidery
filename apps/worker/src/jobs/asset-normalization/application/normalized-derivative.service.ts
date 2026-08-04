/**
 * Editor-safe derivative production (`APP3-W01A`).
 *
 * One fresh read of the private original per output, decoded and re-encoded
 * through the accepted libvips pipeline whose output is piped straight into
 * managed multipart. No complete original and no complete derivative ever exists
 * as a JavaScript value — the same no-buffering rule APP2 established, and for
 * the same reason: a worker sized for many small jobs must not hold a 10 MiB
 * image and its output in memory at once.
 *
 * The measurements written to the row come from the **encoder's own report** and
 * from a counter on the bytes that actually reached the store. Never from the
 * source Asset's `mime_type` or `size_bytes`, never from inspection detail,
 * never from a caller and never from Product Side geometry (IMP-D044 PO-07,
 * PO-12). A pipeline that silently produced something else must be caught here,
 * not discovered when a Studio canvas comes out the wrong size.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { Writable } from 'node:stream';
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
import {
  abortFailure,
  isAbort,
  toRetryableFailure,
} from '../../asset-inspection/application/storage-failure';
import {
  buildDerivativePipeline,
  captureOutputInfo,
  readSourceMetadata,
  type SourceMetadata,
} from '../../asset-inspection/infrastructure/image/sharp-pipeline';
import {
  ByteLimitExceededError,
  DigestCounterStream,
} from '../../asset-inspection/infrastructure/streams/digest-counter.stream';
import { normalizationRejection } from '../domain/normalization-outcome';
import {
  NORMALIZATION_FORMAT_BY_MEDIA_TYPE,
  NORMALIZATION_LIMITS,
  NORMALIZED_OUTPUT_POLICY,
  TEMPLATE_SVG_MEDIA_TYPE,
  isNormalizationSourceMediaType,
  type NormalizationProfile,
  type NormalizationSourceMediaType,
} from '../domain/normalization-policy';
import type { NormalizationSourceFacts } from '../domain/repositories/asset-normalization.repository';

/** EXIF orientations 5-8 transpose the image, so width and height swap. */
const TRANSPOSING_ORIENTATION = 5;

export interface NormalizedOutput {
  readonly storageKey: string;
  readonly checksum: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly mediaType: string;
  readonly byteSize: bigint;
}

@Injectable()
export class NormalizedDerivativeService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** The deterministic key for this Asset's editor-safe output. */
  derivativeKey(assetId: string): string {
    return buildDerivativeObjectKey({
      environment: this.environment as ObjectStorageEnvironment,
      assetId,
      derivativeKind: NORMALIZED_OUTPUT_POLICY.kind,
      contentType: NORMALIZED_OUTPUT_POLICY.mediaType,
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

  /**
   * Decides whether these bytes may be normalized at all, before any decode.
   *
   * Media type first and by the **recorded** type, never by extension: an
   * extension is a filename the client chose. Template SVG gets its own answer
   * because it is authorized and merely unavailable (`IMP-D046` PO-07), and
   * reporting it as an unsupported type would make `APP3-W01B` look like a
   * product change rather than a delivery.
   */
  assertProcessableSource(
    profile: NormalizationProfile,
    source: NormalizationSourceFacts,
  ): NormalizationSourceMediaType {
    if (source.mediaType === TEMPLATE_SVG_MEDIA_TYPE) {
      throw normalizationRejection(
        profile === 'TEMPLATE_ASSET'
          ? 'TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE'
          : // SVG is profile-invalid for a side background and a session upload
            // under IMP-D044 PO-03/PO-05, and stays so after W01B.
            'NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED',
      );
    }
    if (!isNormalizationSourceMediaType(source.mediaType)) {
      throw normalizationRejection('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
    }
    if (source.byteSize > BigInt(NORMALIZATION_LIMITS.maxSourceBytes)) {
      // The recorded size, checked before a byte is fetched. The streamed count
      // is checked again below against the same ceiling.
      throw normalizationRejection('NORMALIZATION_SOURCE_TOO_LARGE');
    }
    return source.mediaType;
  }

  /**
   * Verifies the stored bytes and applies the decoded limits.
   *
   * Integrity first: it is the only check that can prove the object still *is*
   * the file the row describes. Everything after — the format match, the
   * dimension bounds, the derivative a customer designs on — is a statement
   * about those bytes, and making it about different bytes is how a swapped
   * object becomes an editor background.
   */
  async verifySource(
    mediaType: NormalizationSourceMediaType,
    source: NormalizationSourceFacts,
    signal: AbortSignal,
  ): Promise<void> {
    await this.verifyIntegrity(source, signal);
    const metadata = await this.readMetadata(source, signal);
    this.applyDecodedLimits(mediaType, metadata);
  }

  /**
   * Produces the derivative and returns what the bytes actually were.
   *
   * The returned quartet is the encoder's own `info` for width and height, the
   * frozen policy's MIME for the media type, and the counted stream for the byte
   * size — three independent observations of the object that now exists, not
   * three restatements of what was requested.
   */
  async produce(source: NormalizationSourceFacts, signal: AbortSignal): Promise<NormalizedOutput> {
    const key = this.derivativeKey(source.assetId);
    const body = await this.openOriginal(source, signal);
    const pipeline = buildDerivativePipeline(NORMALIZED_OUTPUT_POLICY);
    const info = captureOutputInfo(pipeline);
    const counter = new DigestCounterStream();

    // The counter **is** the upload body, and the upload runs as its own promise
    // — the accepted APP2 shape, and the reason matters. Putting the upload in
    // `pipeline`'s final-destination callback instead resolves when the source
    // ends rather than when the multipart upload completes, so the row could be
    // finalized before the object existed. The live suite caught exactly that,
    // intermittently, which is the only way that bug ever shows up.
    const upload = (async () =>
      this.storage.putObjectStream({
        bucket: 'DERIVATIVES',
        key,
        body: counter,
        contentType: NORMALIZED_OUTPUT_POLICY.mediaType,
        signal,
      }))();

    let uploadFailure: unknown;
    // Observed immediately: an unattached rejection here would surface as an
    // unhandled rejection and take the worker process down.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => {
        uploadFailure = error;
        // Once the upload is gone nothing will read `counter` again, so the
        // pipeline would sit on backpressure until the attempt timed out.
        counter.destroy(error instanceof Error ? error : new Error('derivative upload failed'));
        return error;
      },
    );

    try {
      await streamPipeline(body, pipeline, counter, { signal });
    } catch (error: unknown) {
      await settled;
      const cause = uploadFailure ?? error;
      if (isAbort(signal, cause)) throw abortFailure('derivative upload');
      throw toRetryableFailure('derivative upload', cause);
    }

    const uploadError = await settled;
    if (uploadError !== undefined) {
      if (isAbort(signal, uploadError)) throw abortFailure('derivative upload');
      throw toRetryableFailure('derivative upload', uploadError);
    }

    const produced = info.read();
    if (produced === undefined || produced.width <= 0 || produced.height <= 0) {
      // The encoder finished without reporting what it wrote. Fabricating the
      // quartet from the source would be exactly the substitution PO-12 forbids.
      throw toRetryableFailure('derivative measurement', new Error('no encoder output info'));
    }
    return {
      storageKey: key,
      checksum: counter.digest(),
      widthPx: produced.width,
      heightPx: produced.height,
      mediaType: NORMALIZED_OUTPUT_POLICY.mediaType,
      byteSize: BigInt(counter.byteSize),
    };
  }

  /** Removes a partial or superseded object under this asset's own prefix only. */
  async discardObject(key: string, signal: AbortSignal): Promise<void> {
    try {
      await this.storage.deleteObject({ bucket: 'DERIVATIVES', key }, signal);
    } catch {
      // Best effort by design: a leftover object is invisible because no row
      // points at it, and failing the attempt over a cleanup would convert a
      // recoverable state into a dead-lettered one.
    }
  }

  private async verifyIntegrity(
    source: NormalizationSourceFacts,
    signal: AbortSignal,
  ): Promise<void> {
    if (source.checksum === null) {
      throw normalizationRejection('NORMALIZATION_SOURCE_INTEGRITY_MISMATCH');
    }
    const expected = Number(source.byteSize);
    const counter = new DigestCounterStream({ maxBytes: expected });
    const stream = await this.openOriginal(source, signal);

    try {
      await streamPipeline(stream, counter, discard());
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
    if (counter.byteSize > NORMALIZATION_LIMITS.maxSourceBytes) {
      throw normalizationRejection('NORMALIZATION_SOURCE_TOO_LARGE');
    }
  }

  private async readMetadata(
    source: NormalizationSourceFacts,
    signal: AbortSignal,
  ): Promise<SourceMetadata> {
    const stream = await this.openOriginal(source, signal);
    try {
      return await readSourceMetadata(stream);
    } catch (error: unknown) {
      if (isAbort(signal, error)) throw abortFailure('source metadata read');
      // A header the decoder cannot parse is a property of the file. The native
      // error is dropped: never logged, never persisted, never attached.
      throw normalizationRejection('NORMALIZATION_SOURCE_UNDECODABLE');
    }
  }

  /**
   * The APP3 decoded limits (IMP-D044 PO-08).
   *
   * Measured on the **oriented** dimensions, because an EXIF-rotated portrait is
   * what a customer will actually place a design on. An over-limit source is
   * refused, never resized into compliance: the operator asked for this image,
   * and quietly delivering a smaller one would put a design on geometry nobody
   * chose.
   */
  private applyDecodedLimits(
    mediaType: NormalizationSourceMediaType,
    metadata: SourceMetadata,
  ): void {
    const format = metadata.format;
    if (format === undefined || format !== NORMALIZATION_FORMAT_BY_MEDIA_TYPE[mediaType]) {
      // The recorded type and the decoded container disagree — the row is
      // describing a different file than the store holds.
      throw normalizationRejection('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
    }
    if ((metadata.pages ?? 1) > 1) {
      throw normalizationRejection('NORMALIZATION_SOURCE_ANIMATED');
    }

    const orientation = metadata.orientation ?? 1;
    const transposed = orientation >= TRANSPOSING_ORIENTATION;
    const width = metadata.orientedWidth ?? (transposed ? metadata.height : metadata.width);
    const height = metadata.orientedHeight ?? (transposed ? metadata.width : metadata.height);
    if (width === undefined || height === undefined || width <= 0 || height <= 0) {
      throw normalizationRejection('NORMALIZATION_SOURCE_UNDECODABLE');
    }
    if (
      width > NORMALIZATION_LIMITS.maxDecodedWidth ||
      height > NORMALIZATION_LIMITS.maxDecodedHeight
    ) {
      throw normalizationRejection('NORMALIZATION_DIMENSIONS_EXCEEDED');
    }
    if (width * height > NORMALIZATION_LIMITS.maxDecodedPixels) {
      throw normalizationRejection('NORMALIZATION_PIXEL_BUDGET_EXCEEDED');
    }
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

/** A sink that keeps nothing: the bytes are being measured, not collected. */
function discard(): Writable {
  return new Writable({
    write(_chunk, _encoding, done): void {
      done();
    },
  });
}
