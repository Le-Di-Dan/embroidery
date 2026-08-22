/**
 * The feature-owned safe error contract for Admin SKU authoring (`APP7-B01`).
 *
 * Same shape and the same single translation point as the product-draft
 * contract it sits beside: a transport-free error carried as data, turned into
 * an `HttpException` at exactly one place. Deep inside the transaction that
 * holds the variant lock there is no HTTP, and a repository that threw
 * `ConflictException` would be a persistence layer that knows status codes.
 *
 * A separate vocabulary rather than more `PRODUCT_DRAFT_ERROR_CODES` entries:
 * these refusals are about a different subject with a different lifetime, and
 * folding them into the draft codes would make `PRODUCT_NOT_EDITABLE` mean two
 * unrelated things.
 *
 * Every message is the only free text that reaches a browser. None names a
 * table, a column, a constraint, a SQLSTATE, an id or an actor.
 */
import { ConflictException, NotFoundException, type HttpException } from '@nestjs/common';

export const PRODUCT_SKU_ERROR_CODES = [
  'SKU_PRODUCT_NOT_FOUND',
  'SKU_VARIANT_NOT_FOUND',
  'SKU_VARIANT_PRODUCT_MISMATCH',
  'SKU_NOT_FOUND',
  'SKU_PRODUCT_NOT_AUTHORABLE',
  'SKU_CODE_CONFLICT',
  'SKU_ORDER_ELIGIBLE_AMBIGUOUS',
] as const;

export type ProductSkuErrorCode = (typeof PRODUCT_SKU_ERROR_CODES)[number];

const MESSAGES: Record<ProductSkuErrorCode, string> = {
  SKU_PRODUCT_NOT_FOUND: 'That product does not exist.',
  SKU_VARIANT_NOT_FOUND: 'That product variant does not exist.',
  // Deliberately its own message: an operator who addressed the right variant
  // under the wrong product needs to know that, and reporting it as "no such
  // variant" would send them looking for a row that is there.
  SKU_VARIANT_PRODUCT_MISMATCH: 'That variant does not belong to this product.',
  SKU_NOT_FOUND: 'That SKU does not exist.',
  SKU_PRODUCT_NOT_AUTHORABLE: 'This product is not in a state that allows SKU changes.',
  SKU_CODE_CONFLICT: 'That SKU code is already in use.',
  SKU_ORDER_ELIGIBLE_AMBIGUOUS:
    'A variant can have at most one sellable SKU. Deactivate the current one first.',
};

/** The error every SKU-authoring failure is expressed as before it becomes HTTP. */
export class ProductSkuError extends Error {
  readonly code: ProductSkuErrorCode;

  constructor(code: ProductSkuErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ProductSkuError';
    this.code = code;
  }
}

export function isProductSkuError(error: unknown): error is ProductSkuError {
  return error instanceof ProductSkuError;
}

export function productSkuError(code: ProductSkuErrorCode): ProductSkuError {
  return new ProductSkuError(code);
}

interface ErrorPayload {
  readonly code: ProductSkuErrorCode;
  readonly message: string;
}

/**
 * The exact HTTP status each code maps to.
 *
 * The three "no such row" codes are `404`; the hierarchy mismatch is a `404`
 * too, because the addressed resource — this variant *under this product* —
 * genuinely does not exist. Everything that is a well-formed request against a
 * state that refuses it is a `409`, never a `400`: the client sent nothing
 * wrong, and telling it otherwise would invite a retry with edited input.
 */
const STATUS_BY_CODE: Record<ProductSkuErrorCode, (payload: ErrorPayload) => HttpException> = {
  SKU_PRODUCT_NOT_FOUND: (payload) => new NotFoundException(payload),
  SKU_VARIANT_NOT_FOUND: (payload) => new NotFoundException(payload),
  SKU_VARIANT_PRODUCT_MISMATCH: (payload) => new NotFoundException(payload),
  SKU_NOT_FOUND: (payload) => new NotFoundException(payload),
  SKU_PRODUCT_NOT_AUTHORABLE: (payload) => new ConflictException(payload),
  SKU_CODE_CONFLICT: (payload) => new ConflictException(payload),
  SKU_ORDER_ELIGIBLE_AMBIGUOUS: (payload) => new ConflictException(payload),
};

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: ProductSkuError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
