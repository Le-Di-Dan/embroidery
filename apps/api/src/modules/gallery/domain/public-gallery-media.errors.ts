/**
 * The safe error contract for public gallery-media delivery (`APP11-B03` §9.1).
 *
 * Three codes, and the small number is the point. Every visibility and
 * eligibility miss — unknown slug, draft entry, archived entry, unknown asset,
 * an asset associated to a *different* entry, a `CUSTOMER_PRIVATE` or
 * `PRODUCTION_SENSITIVE` asset, a rejected, deletion-pending or tombstoned
 * asset, and a derivative that is missing, unready, watermarked or keyless —
 * collapses into the *same* `PUBLIC_GALLERY_MEDIA_NOT_FOUND`. A caller must not
 * be able to tell an unpublished entry from a nonexistent one, nor confirm that
 * a customer's private artwork exists, because that is exactly the fact that
 * has not been made public.
 *
 * Messages are written once, here, and never interpolated at a call site: this
 * free text is the only prose that reaches an anonymous browser, so nothing may
 * assemble it from a slug, an id, a bucket, a key or a provider name.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const PUBLIC_GALLERY_MEDIA_ERROR_CODES = [
  'PUBLIC_GALLERY_MEDIA_NOT_FOUND',
  'PUBLIC_GALLERY_MEDIA_INVALID',
  'PUBLIC_GALLERY_MEDIA_UNAVAILABLE',
] as const;

export type PublicGalleryMediaErrorCode = (typeof PUBLIC_GALLERY_MEDIA_ERROR_CODES)[number];

const MESSAGES: Record<PublicGalleryMediaErrorCode, string> = {
  PUBLIC_GALLERY_MEDIA_NOT_FOUND: 'That gallery image is not available.',
  PUBLIC_GALLERY_MEDIA_INVALID: 'The requested gallery image address is not valid.',
  PUBLIC_GALLERY_MEDIA_UNAVAILABLE: 'Gallery images are temporarily unavailable. Please try again.',
};

export class PublicGalleryMediaError extends Error {
  readonly code: PublicGalleryMediaErrorCode;

  constructor(code: PublicGalleryMediaErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicGalleryMediaError';
    this.code = code;
  }
}

export function isPublicGalleryMediaError(error: unknown): error is PublicGalleryMediaError {
  return error instanceof PublicGalleryMediaError;
}

export function publicGalleryMediaError(
  code: PublicGalleryMediaErrorCode,
): PublicGalleryMediaError {
  return new PublicGalleryMediaError(code);
}

/** The single not-found used by every visibility and eligibility miss. */
export function publicGalleryMediaNotFound(): PublicGalleryMediaError {
  return new PublicGalleryMediaError('PUBLIC_GALLERY_MEDIA_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: PublicGalleryMediaErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<PublicGalleryMediaErrorCode, (p: ErrorPayload) => HttpException> = {
  PUBLIC_GALLERY_MEDIA_NOT_FOUND: (p) => new NotFoundException(p),
  PUBLIC_GALLERY_MEDIA_INVALID: (p) => new BadRequestException(p),
  // Distinguished from 404 on purpose: the descriptor resolved, so the entry
  // *is* published and the image *should* exist. Reporting a storage outage as
  // not-found would tell a caller to stop retrying a request that will succeed
  // once the provider recovers.
  PUBLIC_GALLERY_MEDIA_UNAVAILABLE: (p) => new ServiceUnavailableException(p),
};

export function toHttpException(error: PublicGalleryMediaError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
