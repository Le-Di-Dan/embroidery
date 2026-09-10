/**
 * The feature-owned safe error contract for Admin variant authoring
 * (`APP12-N02.B01`).
 *
 * Same shape and the same single translation point as the SKU contract it sits
 * beside: a transport-free error carried as data, turned into an
 * `HttpException` at exactly one place. Deep inside the transaction that holds
 * the Product write lock there is no HTTP, and a repository that threw
 * `ConflictException` would be a persistence layer that knows status codes.
 *
 * A vocabulary of its own rather than more `PRODUCT_SKU_ERROR_CODES` entries.
 * The two features share a screen, not a subject: `SKU_VARIANT_NOT_FOUND` means
 * "the variant this SKU was to be created under is missing", and reusing it for
 * "the variant you asked to rename is missing" would make one code mean two
 * things to the client that has to tell them apart.
 *
 * Every message is the only free text that reaches a browser. None names a
 * table, a column, a constraint, a SQLSTATE, an id or an actor — and none
 * echoes the label the request sent, which would put operator input back on the
 * wire through an error path.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

export const PRODUCT_VARIANT_ERROR_CODES = [
  'VARIANT_PRODUCT_NOT_FOUND',
  'VARIANT_NOT_FOUND',
  'VARIANT_PRODUCT_MISMATCH',
  'VARIANT_PRODUCT_NOT_AUTHORABLE',
  'VARIANT_LABEL_REQUIRED',
  'PRODUCT_VARIANT_DUPLICATE',
] as const;

export type ProductVariantErrorCode = (typeof PRODUCT_VARIANT_ERROR_CODES)[number];

const MESSAGES: Record<ProductVariantErrorCode, string> = {
  VARIANT_PRODUCT_NOT_FOUND: 'That product does not exist.',
  VARIANT_NOT_FOUND: 'That product variant does not exist.',
  // Its own message for the reason the SKU contract states: an operator who
  // addressed the right variant under the wrong product needs to know that.
  VARIANT_PRODUCT_MISMATCH: 'That variant does not belong to this product.',
  VARIANT_PRODUCT_NOT_AUTHORABLE: 'This product is not in a state that allows variant changes.',
  VARIANT_LABEL_REQUIRED: 'A variant needs a colour, a size, or both.',
  PRODUCT_VARIANT_DUPLICATE: 'This product already has a variant with that colour and size.',
};

/** The error every variant-authoring failure is expressed as before it becomes HTTP. */
export class ProductVariantError extends Error {
  readonly code: ProductVariantErrorCode;

  constructor(code: ProductVariantErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ProductVariantError';
    this.code = code;
  }
}

export function isProductVariantError(error: unknown): error is ProductVariantError {
  return error instanceof ProductVariantError;
}

export function productVariantError(code: ProductVariantErrorCode): ProductVariantError {
  return new ProductVariantError(code);
}

interface ErrorPayload {
  readonly code: ProductVariantErrorCode;
  readonly message: string;
}

/**
 * The exact HTTP status each code maps to.
 *
 * The three "no such row" codes are `404`, the hierarchy mismatch included:
 * this variant *under this product* genuinely does not exist.
 *
 * `VARIANT_LABEL_REQUIRED` is a `400` and the duplicate is a `409`, and the
 * split is deliberate. A request that names no label is wrong in itself and the
 * client fixes it by editing what it sent. A duplicate is a well-formed request
 * refused by state the client did not send and cannot see — the colliding
 * variant may merely be deactivated — so it is a conflict, and reporting it as
 * a bad request would invite an edit that changes nothing.
 */
const STATUS_BY_CODE: Record<ProductVariantErrorCode, (payload: ErrorPayload) => HttpException> = {
  VARIANT_PRODUCT_NOT_FOUND: (payload) => new NotFoundException(payload),
  VARIANT_NOT_FOUND: (payload) => new NotFoundException(payload),
  VARIANT_PRODUCT_MISMATCH: (payload) => new NotFoundException(payload),
  VARIANT_PRODUCT_NOT_AUTHORABLE: (payload) => new ConflictException(payload),
  VARIANT_LABEL_REQUIRED: (payload) => new BadRequestException(payload),
  PRODUCT_VARIANT_DUPLICATE: (payload) => new ConflictException(payload),
};

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: ProductVariantError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
