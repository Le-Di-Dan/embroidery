/**
 * The `asset_inspections.detail` V1 document (APP2-W01 §14).
 *
 * `detail` is an existing nullable `text` column (TBL-023), so this checkpoint
 * adds no column and no migration: the measurements a reviewer needs — what was
 * decoded, under which policy, into which derivatives — live in one versioned,
 * bounded JSON document instead of five new columns.
 *
 * The document is an **allow-list**, built key by key from typed inputs and
 * re-validated on the way out. It therefore cannot contain a filename, an
 * object key, a bucket, an EXIF or ICC blob, an exception message, a stack or
 * any request data: there is no code path that puts one in.
 *
 * Encoding is bounded at 8 KiB of UTF-8. Nothing this builder produces comes
 * close, which is the point — the bound exists so a future edit that adds an
 * unbounded array fails here rather than in production.
 */
import type { AssetRejectionCode } from './processing-rejection';
import type {
  CatalogDerivativeKind,
  ProcessableFormat,
  ProcessableMediaType,
} from './asset-processing-policy';
import { ASSET_PROCESSING_POLICY_VERSION } from './asset-processing-policy';

export const INSPECTION_DETAIL_SCHEMA_VERSION = 1;

/**
 * The pinned image processor, written into every record.
 *
 * A literal rather than a read of `sharp.versions`: the domain layer must not
 * import the native module, and a spec asserts this constant still matches the
 * installed version — so an upgrade that changes encoder behaviour cannot land
 * without also updating the value that records which encoder produced the
 * bytes.
 */
export const IMAGE_PROCESSOR_NAME = 'sharp';
export const IMAGE_PROCESSOR_VERSION = '0.35.3';

/** Serialized UTF-8 ceiling for one document. */
export const MAX_INSPECTION_DETAIL_BYTES = 8_192;

export interface InspectedSource {
  readonly mediaType: ProcessableMediaType;
  readonly format: ProcessableFormat;
  readonly byteSize: number;
  readonly checksum: string;
  readonly width: number;
  readonly height: number;
  readonly orientedWidth: number;
  readonly orientedHeight: number;
  readonly channels: number;
  readonly pages: number;
}

export interface InspectedDerivative {
  readonly kind: CatalogDerivativeKind;
  readonly mediaType: 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly checksum: string;
  readonly isWatermarked: false;
}

export interface AcceptedInspectionDetail {
  readonly schemaVersion: number;
  readonly policyVersion: number;
  readonly processor: { readonly name: string; readonly version: string };
  readonly result: 'ACCEPTED';
  readonly source: InspectedSource;
  readonly derivatives: readonly InspectedDerivative[];
}

export interface RejectedInspectionDetail {
  readonly schemaVersion: number;
  readonly policyVersion: number;
  readonly processor: { readonly name: string; readonly version: string };
  readonly result: 'REJECTED';
  readonly rejectionCode: AssetRejectionCode;
  /** True when controlled derivative cleanup could not be completed. */
  readonly cleanupPending: boolean;
}

export type InspectionDetail = AcceptedInspectionDetail | RejectedInspectionDetail;

function processor(): { name: string; version: string } {
  return { name: IMAGE_PROCESSOR_NAME, version: IMAGE_PROCESSOR_VERSION };
}

export function buildAcceptedDetail(input: {
  readonly source: InspectedSource;
  readonly derivatives: readonly InspectedDerivative[];
}): AcceptedInspectionDetail {
  return {
    schemaVersion: INSPECTION_DETAIL_SCHEMA_VERSION,
    policyVersion: ASSET_PROCESSING_POLICY_VERSION,
    processor: processor(),
    result: 'ACCEPTED',
    source: { ...input.source },
    derivatives: input.derivatives.map((derivative) => ({ ...derivative })),
  };
}

export function buildRejectedDetail(input: {
  readonly rejectionCode: AssetRejectionCode;
  readonly cleanupPending: boolean;
}): RejectedInspectionDetail {
  return {
    schemaVersion: INSPECTION_DETAIL_SCHEMA_VERSION,
    policyVersion: ASSET_PROCESSING_POLICY_VERSION,
    processor: processor(),
    result: 'REJECTED',
    rejectionCode: input.rejectionCode,
    cleanupPending: input.cleanupPending,
  };
}

/**
 * Serialises a document, refusing anything over the bound.
 *
 * The overflow is an invariant failure rather than a truncation: half a JSON
 * document in an append-only evidence column is worse than none, because it
 * looks like a record and cannot be parsed back.
 */
export function encodeInspectionDetail(detail: InspectionDetail): string {
  const encoded = JSON.stringify(detail);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_INSPECTION_DETAIL_BYTES) {
    throw new Error(
      `Inspection detail exceeds ${String(MAX_INSPECTION_DETAIL_BYTES)} bytes and was not written.`,
    );
  }
  return encoded;
}
