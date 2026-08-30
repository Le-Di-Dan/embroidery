/**
 * The closed error vocabulary of the public SEO inventory (`APP11-B04`).
 *
 * Exactly one code, because the operation takes no input: there is no slug to
 * miss, no cursor to malform and no query parameter to reject. The only way it
 * can fail on its own terms is the safety cap — the inventory has outgrown what
 * a single response may carry — and that is a server-side capacity fact, not
 * something the caller did.
 *
 * Nothing here interpolates a slug, a count, a table or a column name. A public
 * boundary must not become an oracle for how much unreleased or released work
 * exists.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PUBLIC_SITEMAP_ERROR_CODES = [
  /** The inventory exceeds the one-response cap; a partial index is never sent. */
  'PUBLIC_SITEMAP_INVENTORY_TOO_LARGE',
] as const;

export type PublicSitemapErrorCode = (typeof PUBLIC_SITEMAP_ERROR_CODES)[number];

const MESSAGES: Record<PublicSitemapErrorCode, string> = {
  PUBLIC_SITEMAP_INVENTORY_TOO_LARGE: 'The sitemap inventory is currently unavailable.',
};

export class PublicSitemapError extends Error {
  readonly code: PublicSitemapErrorCode;

  constructor(code: PublicSitemapErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicSitemapError';
    this.code = code;
  }
}

export function isPublicSitemapError(error: unknown): error is PublicSitemapError {
  return error instanceof PublicSitemapError;
}

/**
 * Raised instead of returning a truncated inventory.
 *
 * A crawler cannot distinguish a truncated sitemap from a complete one, and
 * would read the absent URLs as delisted — so failing loudly is strictly safer
 * than succeeding partially, and the 503 tells a consumer to retry rather than
 * to act on what it received.
 */
export function publicSitemapInventoryTooLarge(): PublicSitemapError {
  return new PublicSitemapError('PUBLIC_SITEMAP_INVENTORY_TOO_LARGE');
}

/**
 * 503 rather than 4xx: nothing the caller sent is wrong. The global filter
 * redacts the body of any 5xx, which is intended here — the operator learns the
 * real cause from the log, and an anonymous caller learns only that the
 * inventory is unavailable, never how large it grew.
 */
export function toHttpException(error: PublicSitemapError): HttpException {
  return new ServiceUnavailableException({ code: error.code, message: error.message });
}
