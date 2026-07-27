/**
 * The closed deterministic-rejection vocabulary (APP2-W01 §9, §16).
 *
 * A rejection is a **business outcome**, not a job failure: the file was read,
 * decoded (or provably could not be), and found unfit to publish. It is written
 * once, terminally, and the job then returns normally — dead-lettering it would
 * put an operator in the loop for something no operator can fix.
 *
 * The set is closed for the same reason the worker error taxonomy is: these
 * codes are persisted in `asset_inspections.detail` and read by humans, so they
 * must never become a sink for a libvips message. A raw Sharp/libvips error is
 * mapped to a code here and then discarded — its text is not persisted, not
 * logged and not attached as a `cause` that something else might serialise.
 */

export const ASSET_REJECTION_CODES = [
  'DECODE_FAILED',
  'SOURCE_MEDIA_TYPE_MISMATCH',
  'ORIGINAL_INTEGRITY_MISMATCH',
  'DIMENSION_LIMIT_EXCEEDED',
  'PIXEL_LIMIT_EXCEEDED',
  'CHANNEL_LIMIT_EXCEEDED',
  'ANIMATED_IMAGE_UNSUPPORTED',
  'SOURCE_FORMAT_UNSUPPORTED',
  'PROCESSING_RETRY_EXHAUSTED',
] as const;

export type AssetRejectionCode = (typeof ASSET_REJECTION_CODES)[number];

export function isAssetRejectionCode(value: string): value is AssetRejectionCode {
  return (ASSET_REJECTION_CODES as readonly string[]).includes(value);
}

/**
 * A deterministic rejection.
 *
 * Carries the code and nothing else. There is deliberately no `detail`, no
 * `cause` and no provider payload: everything a reader needs is the code, and
 * everything else is exactly what §14 forbids from reaching the record.
 */
export class AssetRejectedError extends Error {
  readonly rejectionCode: AssetRejectionCode;

  constructor(rejectionCode: AssetRejectionCode) {
    super(`Asset rejected (${rejectionCode}).`);
    this.name = 'AssetRejectedError';
    this.rejectionCode = rejectionCode;
  }
}

export function isAssetRejectedError(error: unknown): error is AssetRejectedError {
  return error instanceof AssetRejectedError;
}

export function assetRejection(code: AssetRejectionCode): AssetRejectedError {
  return new AssetRejectedError(code);
}
