/**
 * The closed error vocabulary of Admin category management (`APP12-C02`).
 *
 * Same shape as `product-draft.errors.ts` beside it: a transport-free error
 * carried as data and translated to HTTP at exactly one point, because deep in
 * a transaction there is no HTTP and a repository that threw `ConflictException`
 * would be a persistence layer that knows about status codes.
 *
 * Every message is written once here and never interpolated at a call site.
 * None names a table, a column, a constraint, a physical id, a Product or a
 * count — an operator learns *what to do next*, and a raw PostgreSQL string
 * never reaches a browser.
 */
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const ADMIN_CATEGORY_ERROR_CODES = [
  'CATEGORY_NOT_FOUND',
  'CATEGORY_SLUG_CONFLICT',
  'CATEGORY_SLUG_IMMUTABLE',
  'CATEGORY_INVALID_TRANSITION',
  'CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS',
  'CATEGORY_VERSION_CONFLICT',
  'CATEGORY_INVENTORY_TOO_LARGE',
] as const;

export type AdminCategoryErrorCode = (typeof ADMIN_CATEGORY_ERROR_CODES)[number];

const MESSAGES: Record<AdminCategoryErrorCode, string> = {
  CATEGORY_NOT_FOUND: 'That category does not exist.',
  CATEGORY_SLUG_CONFLICT: 'Another category already uses that address.',
  CATEGORY_SLUG_IMMUTABLE: 'A published category keeps the address it was published under.',
  CATEGORY_INVALID_TRANSITION: 'This category cannot make that change from its current state.',
  CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS:
    'Reassign or unpublish the products in this category before archiving it.',
  CATEGORY_VERSION_CONFLICT: 'This category changed since it was loaded. Reload and try again.',
  CATEGORY_INVENTORY_TOO_LARGE: 'The category list is currently unavailable.',
};

export class AdminCategoryError extends Error {
  readonly code: AdminCategoryErrorCode;

  constructor(code: AdminCategoryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'AdminCategoryError';
    this.code = code;
  }
}

export function isAdminCategoryError(error: unknown): error is AdminCategoryError {
  return error instanceof AdminCategoryError;
}

export function adminCategoryError(code: AdminCategoryErrorCode): AdminCategoryError {
  return new AdminCategoryError(code);
}

interface ErrorPayload {
  readonly code: AdminCategoryErrorCode;
  readonly message: string;
}

/**
 * The exact HTTP status each code maps to.
 *
 * Every refusal except "no such row" and the capacity bound is a **409**: each
 * one is a conflict with the row's current state, not a malformed request. The
 * body a client sent to rename a published category is perfectly well-formed;
 * what it asks for is no longer possible.
 */
const STATUS_BY_CODE: Record<AdminCategoryErrorCode, (payload: ErrorPayload) => HttpException> = {
  CATEGORY_NOT_FOUND: (payload) => new NotFoundException(payload),
  CATEGORY_SLUG_CONFLICT: (payload) => new ConflictException(payload),
  CATEGORY_SLUG_IMMUTABLE: (payload) => new ConflictException(payload),
  CATEGORY_INVALID_TRANSITION: (payload) => new ConflictException(payload),
  CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS: (payload) => new ConflictException(payload),
  CATEGORY_VERSION_CONFLICT: (payload) => new ConflictException(payload),
  // Nothing the caller sent is wrong; the taxonomy outgrew one response.
  CATEGORY_INVENTORY_TOO_LARGE: (payload) => new ServiceUnavailableException(payload),
};

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: AdminCategoryError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
