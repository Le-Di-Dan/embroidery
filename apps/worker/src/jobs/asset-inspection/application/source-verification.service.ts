/**
 * Source integrity and decode verification (APP2-W01 §9).
 *
 * Two bounded reads of the private original, in this order:
 *
 *   1. every byte counted and hashed, compared against the facts the intake
 *      transaction committed;
 *   2. header metadata, compared against the processing policy.
 *
 * Integrity comes first because it is the only check that can prove the object
 * still *is* the file the row describes. Everything downstream — the format
 * match, the dimension bounds, the derivative that ends up on a product page —
 * is a statement about those bytes, and making it about different bytes is how
 * a swapped object becomes a published preview.
 *
 * Nothing here trusts the ETag, the object's extension, the client's filename
 * or the provider metadata. The two authorities are the recorded SHA-256 and
 * what the decoder actually reports.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import {
  ASSET_PROCESSING_POLICY_V1,
  SOURCE_FORMAT_BY_MEDIA_TYPE,
  isProcessableMediaType,
  type ProcessableFormat,
  type ProcessableMediaType,
} from '../domain/asset-processing-policy';
import {
  requiresFullDecodeVerification,
  type AssetInspectionLane,
} from '../domain/asset-inspection-lane';
import { contradiction } from '../domain/inspection-contradiction';
import type { InspectedSource } from '../domain/inspection-detail';
import { assetRejection } from '../domain/processing-rejection';
import type { AssetSourceFacts } from '../domain/repositories/asset-inspection.repository';
import {
  readSourceMetadata,
  verifyFullDecode,
  type SourceMetadata,
} from '../infrastructure/image/sharp-pipeline';
import {
  ByteLimitExceededError,
  DigestCounterStream,
} from '../infrastructure/streams/digest-counter.stream';
import { abortFailure, isAbort, toRetryableFailure } from './storage-failure';

/** EXIF orientations 5-8 transpose the image, so width and height swap. */
const TRANSPOSING_ORIENTATION = 5;

@Injectable()
export class SourceVerificationService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}

  /**
   * Verifies the source, and — on a lane that writes no derivative — decodes it.
   *
   * The third read is conditional and its condition is derived, not configured:
   * `requiresFullDecodeVerification` is true exactly when the lane produces no
   * output, because producing one already decodes every pixel. It runs *last*,
   * after the policy has admitted the file, so an oversized or wrong-format
   * image is still rejected with its precise code rather than as a decode
   * failure — and so nothing decodes an image the policy would have refused.
   */
  async verify(
    source: AssetSourceFacts,
    lane: AssetInspectionLane,
    signal: AbortSignal,
  ): Promise<InspectedSource> {
    const mediaType = this.requireProcessableMediaType(source);
    const byteSize = await this.verifyIntegrity(source, signal);
    const metadata = await this.readMetadata(source, signal);
    const inspected = this.applyPolicy(mediaType, byteSize, source, metadata);

    if (requiresFullDecodeVerification(lane)) {
      await this.verifyDecodable(source, signal);
    }
    return inspected;
  }

  /**
   * Read 3 — every pixel, discarded.
   *
   * A decode failure here is a property of the file, exactly as it is in
   * `readMetadata`, so it is a rejection rather than a retry and the native
   * error is dropped: never logged, never persisted, never attached as a cause.
   */
  private async verifyDecodable(source: AssetSourceFacts, signal: AbortSignal): Promise<void> {
    const stream = await this.openOriginal(source, signal);
    try {
      await verifyFullDecode(stream);
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('source decode verification');
      }
      throw assetRejection('DECODE_FAILED');
    }
  }

  private requireProcessableMediaType(source: AssetSourceFacts): ProcessableMediaType {
    if (!isProcessableMediaType(source.mediaType)) {
      // Intake already restricts the type, so this is an asset that never came
      // through B01 — a business rejection rather than a crash, because the
      // file genuinely cannot be processed by this pipeline.
      throw assetRejection('SOURCE_FORMAT_UNSUPPORTED');
    }
    if (source.checksum === null) {
      // Every intake path writes one. A catalog original without a checksum
      // cannot be verified at all, and processing it would mean trusting the
      // object store's copy of a file nobody can prove is the right one.
      throw contradiction('the asset has no recorded checksum');
    }
    return source.mediaType;
  }

  /**
   * Read 1 — the whole object, counted and hashed.
   *
   * The counter carries the recorded size as a hard limit, so an object that
   * grew is abandoned the moment it passes that length instead of being read to
   * the end to reach the same conclusion.
   */
  private async verifyIntegrity(source: AssetSourceFacts, signal: AbortSignal): Promise<number> {
    const expectedSize = Number(source.byteSize);
    const counter = new DigestCounterStream({ maxBytes: expectedSize });
    const stream = await this.openOriginal(source, signal);

    try {
      // `pipeline` rather than `pipe`: it propagates an error from *any* stage
      // and destroys the rest, where `pipe` silently drops a source error and
      // would leave this waiting on a stream that already failed.
      await pipeline(stream, counter, discard());
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('source integrity read');
      }
      if (error instanceof ByteLimitExceededError) {
        throw assetRejection('ORIGINAL_INTEGRITY_MISMATCH');
      }
      throw toRetryableFailure('source integrity read', error);
    }

    if (counter.byteSize !== expectedSize || counter.digest() !== source.checksum) {
      throw assetRejection('ORIGINAL_INTEGRITY_MISMATCH');
    }
    return counter.byteSize;
  }

  /** Read 2 — header metadata only; the stream is dropped once it is known. */
  private async readMetadata(
    source: AssetSourceFacts,
    signal: AbortSignal,
  ): Promise<SourceMetadata> {
    const stream = await this.openOriginal(source, signal);
    try {
      return await readSourceMetadata(stream);
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('source metadata read');
      }
      // A header the decoder cannot parse is a property of the file, so this is
      // a rejection and not a retry. The native error itself is dropped here:
      // it is never logged, never persisted and never attached as a cause.
      throw assetRejection('DECODE_FAILED');
    }
  }

  private applyPolicy(
    mediaType: ProcessableMediaType,
    byteSize: number,
    source: AssetSourceFacts,
    metadata: SourceMetadata,
  ): InspectedSource {
    const format = metadata.format;
    if (format === undefined || !isProcessableFormat(format)) {
      throw assetRejection('SOURCE_FORMAT_UNSUPPORTED');
    }
    if (format !== SOURCE_FORMAT_BY_MEDIA_TYPE[mediaType]) {
      // The bytes decode as something other than what the row (and therefore
      // the object key's extension, and every consumer) says they are.
      throw assetRejection('SOURCE_MEDIA_TYPE_MISMATCH');
    }

    const pages = metadata.pages ?? 1;
    if (pages > ASSET_PROCESSING_POLICY_V1.maxPages) {
      throw assetRejection('ANIMATED_IMAGE_UNSUPPORTED');
    }

    const { width, height, channels } = metadata;
    if (
      width === undefined ||
      height === undefined ||
      channels === undefined ||
      width <= 0 ||
      height <= 0 ||
      channels <= 0
    ) {
      throw assetRejection('DECODE_FAILED');
    }
    if (channels > ASSET_PROCESSING_POLICY_V1.maxChannels) {
      throw assetRejection('CHANNEL_LIMIT_EXCEEDED');
    }

    // libvips computes the post-EXIF size itself (`autoOrient`), and that is
    // the number the resize will actually be applied to. The manual swap is the
    // fallback for a decoder build that does not report it, kept so the two can
    // never silently disagree about which limits were checked.
    const transposed = (metadata.orientation ?? 1) >= TRANSPOSING_ORIENTATION;
    const orientedWidth = metadata.orientedWidth ?? (transposed ? height : width);
    const orientedHeight = metadata.orientedHeight ?? (transposed ? width : height);

    if (
      orientedWidth > ASSET_PROCESSING_POLICY_V1.maxOrientedWidth ||
      orientedHeight > ASSET_PROCESSING_POLICY_V1.maxOrientedHeight
    ) {
      throw assetRejection('DIMENSION_LIMIT_EXCEEDED');
    }
    if (orientedWidth * orientedHeight > ASSET_PROCESSING_POLICY_V1.maxOrientedPixels) {
      throw assetRejection('PIXEL_LIMIT_EXCEEDED');
    }

    return {
      mediaType,
      format,
      byteSize,
      // Non-null by `requireProcessableMediaType`; restated for the type.
      checksum: source.checksum ?? '',
      width,
      height,
      orientedWidth,
      orientedHeight,
      channels,
      pages: 1,
    };
  }

  private async openOriginal(source: AssetSourceFacts, signal: AbortSignal): Promise<Readable> {
    if (signal.aborted) {
      throw abortFailure('source read');
    }
    try {
      const result = await this.storage.getObjectStream(
        { bucket: 'ORIGINALS', key: source.storageKey },
        signal,
      );
      return result.body;
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('source read');
      }
      throw toRetryableFailure('source read', error);
    }
  }
}

function isProcessableFormat(value: string): value is ProcessableFormat {
  return (ASSET_PROCESSING_POLICY_V1.decodedFormats as readonly string[]).includes(value);
}

/**
 * A sink that measures nothing and keeps nothing.
 *
 * The integrity pass has to pull every byte through the counter, but it has no
 * use for the bytes themselves — so they end here rather than in a buffer.
 */
function discard(): Writable {
  return new Writable({
    write(_chunk, _encoding, done): void {
      done();
    },
  });
}
