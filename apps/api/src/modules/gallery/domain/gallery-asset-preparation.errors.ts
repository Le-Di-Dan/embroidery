/**
 * The feature-owned safe error contract for Admin gallery-asset preparation
 * (`APP11-B03A` §21).
 *
 * The shape is `asset-intake.errors.ts`'s, deliberately: a code table, a frozen
 * message per code, a transport-free error class and one translation point.
 * The codes are this operation's own, because the rules they report are.
 *
 * **Recorded platform behaviour, not a bypass:** the canonical exception mapper
 * replaces every 5xx code and message with `INTERNAL_SERVER_ERROR` and the
 * generic text. `GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE` (503) therefore
 * keeps its **status** on the wire but reaches the client as the generic
 * server-fault code; it is named here because that is the operator-facing name
 * and the status is the part a client can act on. Every 4xx code reaches the
 * client verbatim.
 *
 * ## What the vocabulary deliberately cannot say
 *
 * There is one refusal for "this source cannot be promoted", and it covers an
 * unknown id, a customer's private upload, an already-public asset, a rejected
 * or tombstoned one, and one whose renditions are not ready. Splitting those
 * would let an authenticated caller enumerate the private lane by reading the
 * difference between two 404s — the same reason `AssetCatalogQuery` reports a
 * scoped miss as `ASSET_NOT_FOUND`. The one exception is the version conflict,
 * which is safe to distinguish precisely because it is only reachable once the
 * caller has already proved it holds a token for a source it may read.
 */
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const GALLERY_ASSET_PREPARATION_ERROR_CODES = [
  'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
  'GALLERY_ASSET_SOURCE_VERSION_CONFLICT',
  'GALLERY_ASSET_NOT_FOUND',
  'GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE',
] as const;

export type GalleryAssetPreparationErrorCode =
  (typeof GALLERY_ASSET_PREPARATION_ERROR_CODES)[number];

/**
 * Client-safe messages. None names a bucket, storage key, checksum, provider,
 * SQL fragment or actor — the message is the only free text that reaches a
 * browser, so it is written once here and never interpolated at a call site.
 */
const MESSAGES: Record<GalleryAssetPreparationErrorCode, string> = {
  GALLERY_ASSET_SOURCE_NOT_ELIGIBLE:
    'That image cannot be prepared for the gallery. It must be an accepted product image whose ' +
    'display renditions are ready.',
  GALLERY_ASSET_SOURCE_VERSION_CONFLICT:
    'That image changed since it was read. Reload it and try again.',
  GALLERY_ASSET_NOT_FOUND: 'That gallery image does not exist.',
  GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE:
    'Image storage is temporarily unavailable. Please try again.',
};

export class GalleryAssetPreparationError extends Error {
  readonly code: GalleryAssetPreparationErrorCode;

  constructor(code: GalleryAssetPreparationErrorCode) {
    super(MESSAGES[code]);
    this.name = 'GalleryAssetPreparationError';
    this.code = code;
  }
}

export function isGalleryAssetPreparationError(
  error: unknown,
): error is GalleryAssetPreparationError {
  return error instanceof GalleryAssetPreparationError;
}

export function galleryAssetPreparationError(
  code: GalleryAssetPreparationErrorCode,
): GalleryAssetPreparationError {
  return new GalleryAssetPreparationError(code);
}

/** The exact HTTP status each code maps to. */
const STATUS_BY_CODE: Record<
  GalleryAssetPreparationErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  // 404, not 422: an ineligible source is indistinguishable from an absent one
  // by design, so both answer the same way.
  GALLERY_ASSET_SOURCE_NOT_ELIGIBLE: (payload) => new NotFoundException(payload),
  GALLERY_ASSET_SOURCE_VERSION_CONFLICT: (payload) => new ConflictException(payload),
  GALLERY_ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
  GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE: (payload) =>
    new ServiceUnavailableException(payload),
};

interface ErrorPayload {
  readonly code: GalleryAssetPreparationErrorCode;
  readonly message: string;
}

/** Converts the transport-free error into the canonical HTTP exception. */
export function toHttpException(error: GalleryAssetPreparationError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
