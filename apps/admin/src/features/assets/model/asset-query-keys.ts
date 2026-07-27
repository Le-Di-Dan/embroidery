/**
 * The one query-key factory for the Admin asset capability.
 *
 * Keys carry only the cache-identifying page size and the `assetId`. A `File`,
 * an `AbortController`, an `Idempotency-Key`, a raw error or anything
 * credential-shaped is never part of a key — keys are serialized into the cache
 * and would outlive the intent that produced them.
 */

/** Server default and client request size for one page (`APP2-B01` §list). */
export const ASSET_LIST_PAGE_SIZE = 20;

const ROOT = ['admin', 'assets'] as const;

export const assetQueryKeys = {
  all: ROOT,
  list: (pageSize: number = ASSET_LIST_PAGE_SIZE) => [...ROOT, 'list', { pageSize }] as const,
  detail: (assetId: string) => [...ROOT, 'detail', assetId] as const,
} as const;
