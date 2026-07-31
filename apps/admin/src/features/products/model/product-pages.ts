/**
 * Pure page accumulation for the keyset-paginated product list.
 *
 * The list is cursor-paginated, so a concurrent draft creation can shift the
 * keyset window and make one product appear on two pages. Rendering it twice
 * would be a lie about the collection, and re-sorting would move rows under the
 * operator's cursor — so the first occurrence wins and prior order is never
 * disturbed. `productId` is the rendered identity.
 */
import type { AdminProductListResponse, AdminProductSummaryResponse } from '@embroidery/api-client';

/**
 * Flattens accumulated pages in server order, keeping the first occurrence of
 * each `productId`. Deterministic and side-effect free.
 */
export function flattenProductPages(
  pages: readonly AdminProductListResponse[],
): readonly AdminProductSummaryResponse[] {
  const seen = new Set<string>();
  const items: AdminProductSummaryResponse[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.productId)) {
        continue;
      }
      seen.add(item.productId);
      items.push(item);
    }
  }
  return items;
}

/**
 * The cursor for the next request, or `undefined` when the collection is
 * exhausted. Both parts of the contract must hold: `hasNext` alone is not a
 * cursor, and a stale `nextCursor` on a last page is not a continuation.
 */
export function resolveNextCursor(page: AdminProductListResponse | undefined): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
