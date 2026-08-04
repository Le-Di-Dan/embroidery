/**
 * The safe error contract for Product placement authoring (`APP3-B01`).
 *
 * Same shape and same discipline as `product-draft.errors.ts`: a transport-free
 * error carried as data, translated to an HTTP exception at exactly one point.
 * Deep inside a transaction there is no HTTP, and a repository that threw
 * `ConflictException` would be a persistence layer that knew about status codes.
 *
 * Every message here is the only free text that reaches a browser. None names a
 * table, a column, a constraint, a storage key, an asset id or a row — including
 * the ones raised in response to a database guard, whose own message names both
 * the table and the offending columns and must never be forwarded.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

export const PRODUCT_PLACEMENT_ERROR_CODES = [
  'PLACEMENT_PRODUCT_NOT_FOUND',
  'PLACEMENT_INVALID',
  'PLACEMENT_CODE_DUPLICATE',
  'PLACEMENT_ROW_NOT_IN_PARENT',
  'PLACEMENT_GEOMETRY_INVALID',
  'PLACEMENT_SCALE_INCONSISTENT',
  'PLACEMENT_AREA_OUTSIDE_CANVAS',
  'PLACEMENT_BACKGROUND_NOT_FOUND',
  'PLACEMENT_BACKGROUND_NOT_ELIGIBLE',
  'PLACEMENT_REFERENCED_IMMUTABLE',
  'PLACEMENT_REPLACEMENT_INVALID',
  'PLACEMENT_VERSION_CONFLICT',
] as const;

export type ProductPlacementErrorCode = (typeof PRODUCT_PLACEMENT_ERROR_CODES)[number];

const MESSAGES: Record<ProductPlacementErrorCode, string> = {
  PLACEMENT_PRODUCT_NOT_FOUND: 'That product does not exist.',
  PLACEMENT_INVALID: 'The placement request is missing or not permitted.',
  PLACEMENT_CODE_DUPLICATE: 'Two placements were given the same code.',
  PLACEMENT_ROW_NOT_IN_PARENT: 'A placement was addressed that does not belong here.',
  PLACEMENT_GEOMETRY_INVALID: 'The placement geometry is not usable.',
  PLACEMENT_SCALE_INCONSISTENT:
    'The image size, physical size and scale of a side do not agree with each other.',
  PLACEMENT_AREA_OUTSIDE_CANVAS: 'An embroidery area lies outside its side.',
  PLACEMENT_BACKGROUND_NOT_FOUND: 'A chosen background image does not exist.',
  PLACEMENT_BACKGROUND_NOT_ELIGIBLE: 'A chosen background image cannot be used for a side.',
  PLACEMENT_REFERENCED_IMMUTABLE:
    'This placement is already in use and can no longer be changed. Retire it and add a replacement.',
  PLACEMENT_REPLACEMENT_INVALID: 'A placement may only be replaced within the same product side.',
  PLACEMENT_VERSION_CONFLICT: 'This product changed since it was loaded. Reload and try again.',
};

export class ProductPlacementError extends Error {
  readonly code: ProductPlacementErrorCode;
  /**
   * Stable machine codes explaining *which* parts failed.
   *
   * A closed set of literals this feature owns, never a field value, an
   * identifier or a database message.
   */
  readonly details: readonly string[];

  constructor(code: ProductPlacementErrorCode, details: readonly string[] = []) {
    super(MESSAGES[code]);
    this.name = 'ProductPlacementError';
    this.code = code;
    this.details = details;
  }
}

export function isProductPlacementError(error: unknown): error is ProductPlacementError {
  return error instanceof ProductPlacementError;
}

export function productPlacementError(
  code: ProductPlacementErrorCode,
  details: readonly string[] = [],
): ProductPlacementError {
  return new ProductPlacementError(code, details);
}

interface ErrorPayload {
  readonly code: ProductPlacementErrorCode;
  readonly message: string;
  readonly errors?: readonly { field: string; code: string; message: string }[];
}

/**
 * The exact HTTP status each code maps to.
 *
 * The split is between "you sent something wrong" (400) and "the store's state
 * refuses this" (409). A referenced placement is the second kind: the request
 * was well formed and would have been accepted an hour earlier.
 */
const STATUS_BY_CODE: Record<ProductPlacementErrorCode, (payload: ErrorPayload) => HttpException> =
  {
    PLACEMENT_PRODUCT_NOT_FOUND: (payload) => new NotFoundException(payload),
    PLACEMENT_INVALID: (payload) => new BadRequestException(payload),
    PLACEMENT_CODE_DUPLICATE: (payload) => new BadRequestException(payload),
    PLACEMENT_ROW_NOT_IN_PARENT: (payload) => new BadRequestException(payload),
    PLACEMENT_GEOMETRY_INVALID: (payload) => new BadRequestException(payload),
    PLACEMENT_SCALE_INCONSISTENT: (payload) => new BadRequestException(payload),
    PLACEMENT_AREA_OUTSIDE_CANVAS: (payload) => new BadRequestException(payload),
    PLACEMENT_BACKGROUND_NOT_FOUND: (payload) => new BadRequestException(payload),
    PLACEMENT_BACKGROUND_NOT_ELIGIBLE: (payload) => new ConflictException(payload),
    PLACEMENT_REFERENCED_IMMUTABLE: (payload) => new ConflictException(payload),
    PLACEMENT_REPLACEMENT_INVALID: (payload) => new BadRequestException(payload),
    PLACEMENT_VERSION_CONFLICT: (payload) => new ConflictException(payload),
  };

const DETAIL_FIELD = 'placement';

/** The single translation point from the feature error to canonical HTTP. */
export function toHttpException(error: ProductPlacementError): HttpException {
  return STATUS_BY_CODE[error.code]({
    code: error.code,
    message: error.message,
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
