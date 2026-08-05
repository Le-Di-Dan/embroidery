/**
 * The safe error contract for public Side-background delivery (`APP3-B02` §4).
 *
 * Three codes, and the small number is the point. Every visibility and
 * eligibility miss — unknown slug, draft or archived Product, withdrawn
 * Category, unknown or foreign Side code, retired Side, absent or replaced
 * background, withdrawn Asset, missing/unready/watermarked derivative,
 * incomplete quartet, unapproved media type — collapses into the *same*
 * `PUBLIC_SIDE_BACKGROUND_NOT_FOUND`. A caller must not be able to tell an
 * unpublished Product from a nonexistent one, because the difference is exactly
 * the fact that has not been made public yet.
 *
 * Messages are written once, here, and never interpolated at a call site: this
 * free text is the only prose that reaches an anonymous browser, so nothing may
 * assemble it from a slug, a code, a bucket, a key, a provider name or a SQL
 * fragment.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const PUBLIC_SIDE_BACKGROUND_ERROR_CODES = [
  'PUBLIC_SIDE_BACKGROUND_NOT_FOUND',
  'PUBLIC_SIDE_BACKGROUND_INVALID',
  'PUBLIC_SIDE_BACKGROUND_UNAVAILABLE',
] as const;

export type PublicSideBackgroundErrorCode = (typeof PUBLIC_SIDE_BACKGROUND_ERROR_CODES)[number];

const MESSAGES: Record<PublicSideBackgroundErrorCode, string> = {
  PUBLIC_SIDE_BACKGROUND_NOT_FOUND: 'That product side background is not available.',
  PUBLIC_SIDE_BACKGROUND_INVALID: 'The requested product side background address is not valid.',
  PUBLIC_SIDE_BACKGROUND_UNAVAILABLE:
    'Product side backgrounds are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class PublicSideBackgroundError extends Error {
  readonly code: PublicSideBackgroundErrorCode;

  constructor(code: PublicSideBackgroundErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicSideBackgroundError';
    this.code = code;
  }
}

export function isPublicSideBackgroundError(error: unknown): error is PublicSideBackgroundError {
  return error instanceof PublicSideBackgroundError;
}

export function publicSideBackgroundError(
  code: PublicSideBackgroundErrorCode,
): PublicSideBackgroundError {
  return new PublicSideBackgroundError(code);
}

/** The single not-found used by every visibility and eligibility miss. */
export function publicSideBackgroundNotFound(): PublicSideBackgroundError {
  return new PublicSideBackgroundError('PUBLIC_SIDE_BACKGROUND_NOT_FOUND');
}

const STATUS_BY_CODE: Record<
  PublicSideBackgroundErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PUBLIC_SIDE_BACKGROUND_NOT_FOUND: (payload) => new NotFoundException(payload),
  PUBLIC_SIDE_BACKGROUND_INVALID: (payload) => new BadRequestException(payload),
  // Distinguished from 404 on purpose: the descriptor resolved, so the Product
  // *is* public and the background *should* exist. Reporting a storage outage —
  // or a provider/database size contradiction — as not-found would tell a caller
  // to stop retrying a request that will succeed once the fault is repaired.
  PUBLIC_SIDE_BACKGROUND_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

interface ErrorPayload {
  readonly code: PublicSideBackgroundErrorCode;
  readonly message: string;
}

export function toHttpException(error: PublicSideBackgroundError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
