/**
 * The closed error vocabulary of the two public gallery reads (`APP11-B03`).
 *
 * Three codes, and deliberately no more. A public boundary must not let a
 * caller distinguish *why* something is not visible: "no such slug", "that
 * entry is still a draft", "that entry was archived" and "every image on that
 * entry has been withdrawn" are all `PUBLIC_GALLERY_ENTRY_NOT_FOUND`, because
 * any finer answer turns the endpoint into an oracle for unreleased editorial
 * work. Nothing here interpolates a slug, an id, a status or a column name.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PUBLIC_GALLERY_ENTRY_ERROR_CODES = [
  /** Unknown, draft, archived, or left with no deliverable image — one answer. */
  'PUBLIC_GALLERY_ENTRY_NOT_FOUND',
  /** The cursor is malformed or tampered with. */
  'PUBLIC_GALLERY_ENTRY_CURSOR_INVALID',
  /** A query value the schema admits but the query contract cannot honour. */
  'PUBLIC_GALLERY_ENTRY_QUERY_INVALID',
] as const;

export type PublicGalleryEntryErrorCode = (typeof PUBLIC_GALLERY_ENTRY_ERROR_CODES)[number];

const MESSAGES: Record<PublicGalleryEntryErrorCode, string> = {
  PUBLIC_GALLERY_ENTRY_NOT_FOUND: 'That gallery entry is not available.',
  PUBLIC_GALLERY_ENTRY_CURSOR_INVALID: 'The supplied pagination cursor is not valid.',
  PUBLIC_GALLERY_ENTRY_QUERY_INVALID: 'The supplied query is not valid.',
};

export class PublicGalleryEntryError extends Error {
  readonly code: PublicGalleryEntryErrorCode;

  constructor(code: PublicGalleryEntryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicGalleryEntryError';
    this.code = code;
  }
}

export function isPublicGalleryEntryError(error: unknown): error is PublicGalleryEntryError {
  return error instanceof PublicGalleryEntryError;
}

/** The single not-found every visibility and projection-integrity miss uses. */
export function publicGalleryEntryNotFound(): PublicGalleryEntryError {
  return new PublicGalleryEntryError('PUBLIC_GALLERY_ENTRY_NOT_FOUND');
}

export function publicGalleryEntryCursorInvalid(): PublicGalleryEntryError {
  return new PublicGalleryEntryError('PUBLIC_GALLERY_ENTRY_CURSOR_INVALID');
}

export function publicGalleryEntryQueryInvalid(): PublicGalleryEntryError {
  return new PublicGalleryEntryError('PUBLIC_GALLERY_ENTRY_QUERY_INVALID');
}

interface ErrorPayload {
  readonly code: PublicGalleryEntryErrorCode;
  readonly message: string;
}

/**
 * All three are 4xx on purpose: a 5xx is redacted to `INTERNAL_SERVER_ERROR` by
 * the global filter and would tell the caller nothing it can act on.
 */
const STATUS_BY_CODE: Record<PublicGalleryEntryErrorCode, (p: ErrorPayload) => HttpException> = {
  PUBLIC_GALLERY_ENTRY_NOT_FOUND: (p) => new NotFoundException(p),
  PUBLIC_GALLERY_ENTRY_CURSOR_INVALID: (p) => new BadRequestException(p),
  PUBLIC_GALLERY_ENTRY_QUERY_INVALID: (p) => new BadRequestException(p),
};

export function toHttpException(error: PublicGalleryEntryError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
