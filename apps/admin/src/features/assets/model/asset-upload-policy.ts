/**
 * Client-side mirror of the locked APP2 intake policy (`APP2-B01-G01`).
 *
 * The API is the authority: it re-reads the byte count and the magic bytes and
 * rejects anything the browser let through. These values exist only so the
 * operator gets immediate guidance instead of spending a 25 MiB upload to learn
 * the file was never acceptable. The browser reads `File.type` and `File.size`
 * and nothing else — it performs no signature check and must never claim to.
 */

/** The closed raster allowlist. SVG and every non-image type is rejected. */
export const ACCEPTED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

/** Exact `accept` attribute for the native file input; mirrors the allowlist. */
export const ASSET_FILE_ACCEPT = ACCEPTED_MEDIA_TYPES.join(',');

/** 25 MiB — the authoritative server maximum, mirrored for early guidance. */
export const MAX_UPLOAD_BYTES = 26_214_400;

/** Why a locally selected file cannot be sent. Never exposes the raw value. */
export type FileRejectionReason = 'NO_FILE' | 'MULTIPLE_FILES' | 'MEDIA_UNSUPPORTED' | 'TOO_LARGE';

export type FileSelectionResult =
  | { readonly ok: true; readonly file: File }
  | { readonly ok: false; readonly reason: FileRejectionReason };

/**
 * The single validation path shared by the file input and the drop target, so
 * the two entry points can never diverge. Exactly one file is accepted; the
 * size boundary is inclusive (a file of exactly `MAX_UPLOAD_BYTES` is allowed,
 * the first byte above it is not).
 */
export function validateSelectedFiles(files: readonly File[]): FileSelectionResult {
  if (files.length === 0) {
    return { ok: false, reason: 'NO_FILE' };
  }
  if (files.length > 1) {
    return { ok: false, reason: 'MULTIPLE_FILES' };
  }
  const file = files[0] as File;
  if (!(ACCEPTED_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'MEDIA_UNSUPPORTED' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'TOO_LARGE' };
  }
  return { ok: true, file };
}
