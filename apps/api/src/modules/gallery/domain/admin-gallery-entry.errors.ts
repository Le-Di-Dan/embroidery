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
  // --- `APP11-B02` media selection and publication --------------------------
  'GALLERY_ENTRY_VERSION_CONFLICT',
  'GALLERY_ENTRY_ASSET_DUPLICATE',
  'GALLERY_ENTRY_ASSET_NOT_ELIGIBLE',
  'GALLERY_ENTRY_PUBLICATION_NOT_READY',
  'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED',
  'GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED',
] as const;

export type AdminGalleryEntryErrorCode = (typeof ADMIN_GALLERY_ENTRY_ERROR_CODES)[number];

const MESSAGES: Record<AdminGalleryEntryErrorCode, string> = {
  GALLERY_ENTRY_NOT_FOUND: 'That gallery entry does not exist.',
  GALLERY_ENTRY_SLUG_CONFLICT: 'That gallery address is already in use.',
  GALLERY_ENTRY_LINKED_PRODUCT_INVALID: 'That linked product is not available.',
  GALLERY_ENTRY_CURSOR_INVALID: 'The supplied pagination cursor is not valid.',
  GALLERY_ENTRY_VERSION_CONFLICT:
    'This gallery entry changed since it was loaded. Reload and try again.',
  GALLERY_ENTRY_ASSET_DUPLICATE: 'The same image was selected more than once.',
  // One message for "no such asset" and for "not a public image", deliberately.
  // Two would let a caller tell the difference, and telling the difference is
  // how an endpoint confirms that a customer's private artwork exists.
  GALLERY_ENTRY_ASSET_NOT_ELIGIBLE: 'That image cannot appear in the gallery.',
  GALLERY_ENTRY_PUBLICATION_NOT_READY: 'This gallery entry is not ready to be published yet.',
  GALLERY_ENTRY_PUBLISH_NOT_ALLOWED:
    'This gallery entry cannot be published from its current state.',
  GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED:
    'This gallery entry cannot be unpublished from its current state.',
};

export class AdminGalleryEntryError extends Error {
  readonly code: AdminGalleryEntryErrorCode;
  /**
   * Canonical structured detail codes, when the refusal has any.
   *
   * Only `GALLERY_ENTRY_PUBLICATION_NOT_READY` carries them today — the
   * unsatisfied requirement codes — and it carries them because "not ready"
   * without saying what is missing is an answer an operator cannot act on.
   */
  readonly details: readonly string[];

  constructor(code: AdminGalleryEntryErrorCode, details: readonly string[] = []) {
    super(MESSAGES[code]);
    this.name = 'AdminGalleryEntryError';
    this.code = code;
    this.details = details;
  }
}

export function isAdminGalleryEntryError(error: unknown): error is AdminGalleryEntryError {
  return error instanceof AdminGalleryEntryError;
}

export function adminGalleryEntryError(
  code: AdminGalleryEntryErrorCode,
  details: readonly string[] = [],
): AdminGalleryEntryError {
  return new AdminGalleryEntryError(code, details);
}

interface ErrorPayload {
  readonly code: AdminGalleryEntryErrorCode;
  readonly message: string;
  /** Canonical structured details; omitted entirely when there are none. */
  readonly errors?: readonly { field: string; code: string; message: string }[];
}

/**
 * The `field` every structured detail is filed under.
 *
 * A literal, not an empty string: the platform mapper copies an entry only when
 * `field`, `code` and `message` are all non-empty safe strings, so an empty
 * `field` would be discarded and the detail would silently never arrive.
 */
const DETAIL_FIELD = 'requirements';

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
    // A stale token is a conflict with what is already stored: the body was
    // well-formed and the caller resolves it by reloading, never by editing it.
    GALLERY_ENTRY_VERSION_CONFLICT: (payload) => new ConflictException(payload),
    // Both asset refusals are about the request itself — the caller sent an id
    // it may not use, and can fix it by choosing another image.
    GALLERY_ENTRY_ASSET_DUPLICATE: (payload) => new BadRequestException(payload),
    GALLERY_ENTRY_ASSET_NOT_ELIGIBLE: (payload) => new BadRequestException(payload),
    // Not-ready and wrong-state are conflicts with stored state, not with the
    // body: the same request would succeed once the entry carries what it needs.
    GALLERY_ENTRY_PUBLICATION_NOT_READY: (payload) => new ConflictException(payload),
    GALLERY_ENTRY_PUBLISH_NOT_ALLOWED: (payload) => new ConflictException(payload),
    GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED: (payload) => new ConflictException(payload),
  };

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: AdminGalleryEntryError): HttpException {
  return STATUS_BY_CODE[error.code]({
    code: error.code,
    message: error.message,
    // Details travel in the platform's `errors` array — the one place clients
    // read structured detail from — never in a field this feature invented.
    ...(error.details.length === 0
      ? {}
      : {
          errors: error.details.map((detail) => ({
            field: DETAIL_FIELD,
            code: detail,
            message: error.message,
          })),
        }),
  });
}
