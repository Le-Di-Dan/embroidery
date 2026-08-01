/**
 * The safe error contract for public catalog-media delivery (`APP2-T01` §14).
 *
 * Three codes, and the small number is the point. Every visibility and
 * eligibility miss — unknown slug, draft product, archived product, non-public
 * category, foreign association, detached media, withdrawn asset, missing or
 * unready or watermarked derivative — collapses into the *same*
 * `PUBLIC_PRODUCT_MEDIA_NOT_FOUND`. A caller must not be able to tell an
 * unpublished product from a nonexistent one, because the difference is exactly
 * the fact that has not been made public yet.
 *
 * Messages are written once, here, and never interpolated at a call site: this
 * free text is the only prose that reaches an anonymous browser, so nothing may
 * assemble it from a slug, an id, a bucket, a key, a provider name or a SQL
 * fragment.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const PUBLIC_PRODUCT_MEDIA_ERROR_CODES = [
  'PUBLIC_PRODUCT_MEDIA_NOT_FOUND',
  'PUBLIC_PRODUCT_MEDIA_INVALID',
  'PUBLIC_PRODUCT_MEDIA_UNAVAILABLE',
] as const;

export type PublicProductMediaErrorCode = (typeof PUBLIC_PRODUCT_MEDIA_ERROR_CODES)[number];

const MESSAGES: Record<PublicProductMediaErrorCode, string> = {
  PUBLIC_PRODUCT_MEDIA_NOT_FOUND: 'That product image is not available.',
  PUBLIC_PRODUCT_MEDIA_INVALID: 'The requested product image address is not valid.',
  PUBLIC_PRODUCT_MEDIA_UNAVAILABLE: 'Product images are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class PublicProductMediaError extends Error {
  readonly code: PublicProductMediaErrorCode;

  constructor(code: PublicProductMediaErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicProductMediaError';
    this.code = code;
  }
}

export function isPublicProductMediaError(error: unknown): error is PublicProductMediaError {
  return error instanceof PublicProductMediaError;
}

export function publicProductMediaError(
  code: PublicProductMediaErrorCode,
): PublicProductMediaError {
  return new PublicProductMediaError(code);
}

/** The single not-found used by every visibility and eligibility miss. */
export function publicProductMediaNotFound(): PublicProductMediaError {
  return new PublicProductMediaError('PUBLIC_PRODUCT_MEDIA_NOT_FOUND');
}

const STATUS_BY_CODE: Record<
  PublicProductMediaErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PUBLIC_PRODUCT_MEDIA_NOT_FOUND: (payload) => new NotFoundException(payload),
  PUBLIC_PRODUCT_MEDIA_INVALID: (payload) => new BadRequestException(payload),
  // Distinguished from 404 on purpose: the descriptor resolved, so the product
  // *is* public and the image *should* exist. Reporting a storage outage as
  // not-found would tell a caller to stop retrying a request that will succeed
  // once the provider recovers.
  PUBLIC_PRODUCT_MEDIA_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

interface ErrorPayload {
  readonly code: PublicProductMediaErrorCode;
  readonly message: string;
}

export function toHttpException(error: PublicProductMediaError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
