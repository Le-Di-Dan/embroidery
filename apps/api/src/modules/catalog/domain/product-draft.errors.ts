/**
 * The feature-owned safe error contract for Admin product-draft management
 * (`APP2-B02` §13).
 *
 * Same shape as the asset-intake contract it sits beside: a transport-free
 * error carried as data, translated to an HTTP exception at exactly one point.
 * Deep in a transaction there is no HTTP, and a repository that threw
 * `ConflictException` would be a persistence layer that knows about status
 * codes.
 *
 * Every message here is the only free text that reaches a browser, so it is
 * written once and never interpolated at a call site. None names a table, a
 * column, a constraint, a category id, an actor or a storage fact.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

export const PRODUCT_DRAFT_ERROR_CODES = [
  'PRODUCT_NOT_FOUND',
  'PRODUCT_DRAFT_INVALID',
  'PRODUCT_NOT_EDITABLE',
  'PRODUCT_VERSION_CONFLICT',
  'PRODUCT_CATEGORY_INVALID',
  'PRODUCT_SLUG_CONFLICT',
  'PRODUCT_MEDIA_DUPLICATE',
  'PRODUCT_MEDIA_ASSET_NOT_FOUND',
  'PRODUCT_MEDIA_ASSET_UNAVAILABLE',
  'PRODUCT_ARCHIVE_NOT_ALLOWED',
  'PRODUCT_CURSOR_INVALID',
] as const;

export type ProductDraftErrorCode = (typeof PRODUCT_DRAFT_ERROR_CODES)[number];

const MESSAGES: Record<ProductDraftErrorCode, string> = {
  PRODUCT_NOT_FOUND: 'That product does not exist.',
  PRODUCT_DRAFT_INVALID: 'The product draft request is missing or not permitted.',
  PRODUCT_NOT_EDITABLE: 'This product is not in a state that allows editing.',
  PRODUCT_VERSION_CONFLICT: 'This product changed since it was loaded. Reload and try again.',
  PRODUCT_CATEGORY_INVALID: 'That product category is not available.',
  PRODUCT_SLUG_CONFLICT: 'A product address could not be reserved for this name.',
  PRODUCT_MEDIA_DUPLICATE: 'The same image was selected more than once.',
  PRODUCT_MEDIA_ASSET_NOT_FOUND: 'One of the selected images does not exist.',
  PRODUCT_MEDIA_ASSET_UNAVAILABLE: 'One of the selected images is not ready to be used.',
  PRODUCT_ARCHIVE_NOT_ALLOWED: 'This product cannot be archived from its current state.',
  PRODUCT_CURSOR_INVALID: 'The supplied pagination cursor is not valid.',
};

/**
 * The error every draft failure is expressed as before it becomes an
 * `HttpException`.
 */
export class ProductDraftError extends Error {
  readonly code: ProductDraftErrorCode;

  constructor(code: ProductDraftErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ProductDraftError';
    this.code = code;
  }
}

export function isProductDraftError(error: unknown): error is ProductDraftError {
  return error instanceof ProductDraftError;
}

export function productDraftError(code: ProductDraftErrorCode): ProductDraftError {
  return new ProductDraftError(code);
}

interface ErrorPayload {
  readonly code: ProductDraftErrorCode;
  readonly message: string;
}

/** The exact HTTP status each code maps to (`APP2-B02` §13). */
const STATUS_BY_CODE: Record<ProductDraftErrorCode, (payload: ErrorPayload) => HttpException> = {
  PRODUCT_NOT_FOUND: (payload) => new NotFoundException(payload),
  PRODUCT_DRAFT_INVALID: (payload) => new BadRequestException(payload),
  PRODUCT_NOT_EDITABLE: (payload) => new ConflictException(payload),
  PRODUCT_VERSION_CONFLICT: (payload) => new ConflictException(payload),
  PRODUCT_CATEGORY_INVALID: (payload) => new BadRequestException(payload),
  PRODUCT_SLUG_CONFLICT: (payload) => new ConflictException(payload),
  PRODUCT_MEDIA_DUPLICATE: (payload) => new BadRequestException(payload),
  PRODUCT_MEDIA_ASSET_NOT_FOUND: (payload) => new BadRequestException(payload),
  PRODUCT_MEDIA_ASSET_UNAVAILABLE: (payload) => new ConflictException(payload),
  PRODUCT_ARCHIVE_NOT_ALLOWED: (payload) => new ConflictException(payload),
  PRODUCT_CURSOR_INVALID: (payload) => new BadRequestException(payload),
};

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: ProductDraftError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
