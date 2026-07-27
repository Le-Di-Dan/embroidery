/**
 * The only place an `Asset` becomes something a browser may see (`APP2-B01` §19).
 *
 * The projection is an allowlist, written by hand. A spread of the row would
 * publish `storageKey` the day someone adds a field, and the storage key is the
 * one value that turns a private bucket into a guessable one.
 *
 * Deliberately absent: `storageKey`, `bucketAlias`, `claimToken`,
 * `contentFingerprint`, `inspectionEventId`, the idempotency scope and
 * fingerprint, the raw filename, and every provenance identifier.
 */
import type { Asset } from '../domain/repositories/asset.repository';

/** The upload receipt — identical for a first upload and a completed replay. */
export interface AssetUploadReceipt {
  readonly assetId: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly checksum: string;
}

/** The detail view: the receipt plus the two safe timestamps. */
export interface AssetDetailView extends AssetUploadReceipt {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetListView {
  readonly items: readonly AssetDetailView[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}

/**
 * `sizeBytes` is a `bigint` in the row and a `number` here.
 *
 * Safe by construction: the column is bounded by the 25 MiB intake limit, which
 * is eight orders of magnitude below `Number.MAX_SAFE_INTEGER`. The conversion
 * is explicit so JSON serialisation never meets a `bigint`, which would throw.
 */
function byteSizeOf(asset: Asset): number {
  return Number(asset.sizeBytes);
}

export function toUploadReceipt(asset: Asset): AssetUploadReceipt {
  return {
    assetId: asset.id,
    kind: asset.kind,
    classification: asset.classification,
    status: asset.status,
    mediaType: asset.mimeType,
    byteSize: byteSizeOf(asset),
    // Present for every intake asset: the server computes it before the row is
    // written, so an intake row without one cannot exist.
    checksum: asset.checksum ?? '',
  };
}

export function toDetailView(asset: Asset): AssetDetailView {
  return {
    ...toUploadReceipt(asset),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
