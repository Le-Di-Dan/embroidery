/**
 * The closed error vocabulary of the public category inventory (`APP12-C01`).
 *
 * Exactly one code, because the operation takes no input: there is no slug to
 * miss, no cursor to malform and no query parameter to reject. The only way it
 * can fail on its own terms is the safety cap — the taxonomy has outgrown what
 * a single response may carry — and that is a server-side capacity fact, not
 * something the caller did.
 *
 * Nothing here interpolates a slug, a name, a count, a table or a column name. A
 * public boundary must not become an oracle for what the store has drafted,
 * archived or is preparing to launch.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PUBLIC_CATEGORY_ERROR_CODES = [
  /** The taxonomy exceeds the one-response cap; a partial inventory is never sent. */
  'PUBLIC_CATEGORY_INVENTORY_TOO_LARGE',
] as const;

export type PublicCategoryErrorCode = (typeof PUBLIC_CATEGORY_ERROR_CODES)[number];

const MESSAGES: Record<PublicCategoryErrorCode, string> = {
  PUBLIC_CATEGORY_INVENTORY_TOO_LARGE: 'The category list is currently unavailable.',
};

export class PublicCategoryError extends Error {
  readonly code: PublicCategoryErrorCode;

  constructor(code: PublicCategoryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicCategoryError';
    this.code = code;
  }
}

export function isPublicCategoryError(error: unknown): error is PublicCategoryError {
  return error instanceof PublicCategoryError;
}

/**
 * Raised instead of returning a truncated taxonomy.
 *
 * A consumer cannot distinguish a truncated category list from a complete one,
 * and would render a navigation row that silently omits part of the store — so
 * failing is strictly safer than succeeding partially.
 */
export function publicCategoryInventoryTooLarge(): PublicCategoryError {
  return new PublicCategoryError('PUBLIC_CATEGORY_INVENTORY_TOO_LARGE');
}

/**
 * 503 rather than 4xx: nothing the caller sent is wrong. The global filter
 * redacts the body of any 5xx, which is intended here — the operator learns the
 * real cause from the log, and an anonymous caller learns only that the list is
 * unavailable, never how large the taxonomy grew.
 */
export function toHttpException(error: PublicCategoryError): HttpException {
  return new ServiceUnavailableException({ code: error.code, message: error.message });
}
