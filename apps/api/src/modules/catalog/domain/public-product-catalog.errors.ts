/**
 * The closed error vocabulary of the two public catalog queries (`APP2-B04`).
 *
 * Three codes, and deliberately no more. A public boundary must not let a
 * caller distinguish *why* something is not visible: "no such slug", "that
 * product is a draft" and "that product is archived" are all
 * `PUBLIC_PRODUCT_NOT_FOUND`, because any finer answer turns the endpoint into
 * an oracle for unreleased catalogue work. Nothing here interpolates a slug, an
 * id, a status or a column name into a message.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PUBLIC_PRODUCT_CATALOG_ERROR_CODES = [
  /** Unknown, draft, archived, or not coherently publishable — one answer. */
  'PUBLIC_PRODUCT_NOT_FOUND',
  /** The cursor is malformed, tampered with, or belongs to another filter. */
  'PUBLIC_PRODUCT_CURSOR_INVALID',
  /** A query value the schema admits but the query contract cannot honour. */
  'PUBLIC_PRODUCT_QUERY_INVALID',
] as const;

export type PublicProductCatalogErrorCode = (typeof PUBLIC_PRODUCT_CATALOG_ERROR_CODES)[number];

export class PublicProductCatalogError extends Error {
  constructor(
    readonly code: PublicProductCatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicProductCatalogError';
  }
}

export function isPublicProductCatalogError(error: unknown): error is PublicProductCatalogError {
  return error instanceof PublicProductCatalogError;
}

export function publicProductNotFound(): PublicProductCatalogError {
  return new PublicProductCatalogError(
    'PUBLIC_PRODUCT_NOT_FOUND',
    'That product is not available.',
  );
}

export function publicProductCursorInvalid(): PublicProductCatalogError {
  return new PublicProductCatalogError(
    'PUBLIC_PRODUCT_CURSOR_INVALID',
    'The supplied pagination cursor is not valid.',
  );
}

export function publicProductQueryInvalid(): PublicProductCatalogError {
  return new PublicProductCatalogError(
    'PUBLIC_PRODUCT_QUERY_INVALID',
    'The supplied query is not valid.',
  );
}

/**
 * Maps a transport-free domain error onto the canonical HTTP exception.
 *
 * The code travels in the envelope's `code`; the message is the same safe
 * sentence the constructor set. 4xx codes survive the global exception filter
 * unredacted, which is why all three of these are 4xx — a 5xx would arrive at
 * the client as `INTERNAL_SERVER_ERROR` and say nothing.
 */
interface ErrorPayload {
  readonly code: PublicProductCatalogErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  PublicProductCatalogErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PUBLIC_PRODUCT_NOT_FOUND: (payload) => new NotFoundException(payload),
  PUBLIC_PRODUCT_CURSOR_INVALID: (payload) => new BadRequestException(payload),
  PUBLIC_PRODUCT_QUERY_INVALID: (payload) => new BadRequestException(payload),
};

export function toHttpException(error: PublicProductCatalogError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
