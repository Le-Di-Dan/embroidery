/**
 * The feature-owned safe error contract for Admin gallery authoring
 * (`APP11-B01` §9–§11).
 *
 * Same shape as the catalog draft contract it is modelled on: a transport-free
 * error carried as data and translated to an HTTP exception at exactly one
 * point. Deep in a transaction there is no HTTP, and a repository that threw
 * `ConflictException` would be a persistence layer that knows about status
 * codes.
 *
 * Every message here is the only free text that reaches a browser, so it is
 * written once and never interpolated at a call site. None names a table, a
 * column, a constraint, an actor or a storage fact — in particular the slug
 * conflict is reported as a conflict about the address, never as
 * `uq_gallery_entries__slug`.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

export const ADMIN_GALLERY_ENTRY_ERROR_CODES = [
  'GALLERY_ENTRY_NOT_FOUND',
  'GALLERY_ENTRY_SLUG_CONFLICT',
  'GALLERY_ENTRY_LINKED_PRODUCT_INVALID',
  'GALLERY_ENTRY_CURSOR_INVALID',
] as const;

export type AdminGalleryEntryErrorCode = (typeof ADMIN_GALLERY_ENTRY_ERROR_CODES)[number];

const MESSAGES: Record<AdminGalleryEntryErrorCode, string> = {
  GALLERY_ENTRY_NOT_FOUND: 'That gallery entry does not exist.',
  GALLERY_ENTRY_SLUG_CONFLICT: 'That gallery address is already in use.',
  GALLERY_ENTRY_LINKED_PRODUCT_INVALID: 'That linked product is not available.',
  GALLERY_ENTRY_CURSOR_INVALID: 'The supplied pagination cursor is not valid.',
};

export class AdminGalleryEntryError extends Error {
  readonly code: AdminGalleryEntryErrorCode;

  constructor(code: AdminGalleryEntryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'AdminGalleryEntryError';
    this.code = code;
  }
}

export function isAdminGalleryEntryError(error: unknown): error is AdminGalleryEntryError {
  return error instanceof AdminGalleryEntryError;
}

export function adminGalleryEntryError(code: AdminGalleryEntryErrorCode): AdminGalleryEntryError {
  return new AdminGalleryEntryError(code);
}

interface ErrorPayload {
  readonly code: AdminGalleryEntryErrorCode;
  readonly message: string;
}

/** The exact HTTP status each code maps to. */
const STATUS_BY_CODE: Record<AdminGalleryEntryErrorCode, (payload: ErrorPayload) => HttpException> =
  {
    GALLERY_ENTRY_NOT_FOUND: (payload) => new NotFoundException(payload),
    // A taken address is a conflict with what is already stored, not a malformed
    // request: the body was well-formed and the caller can only resolve it by
    // choosing a different address.
    GALLERY_ENTRY_SLUG_CONFLICT: (payload) => new ConflictException(payload),
    GALLERY_ENTRY_LINKED_PRODUCT_INVALID: (payload) => new BadRequestException(payload),
    GALLERY_ENTRY_CURSOR_INVALID: (payload) => new BadRequestException(payload),
  };

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: AdminGalleryEntryError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
