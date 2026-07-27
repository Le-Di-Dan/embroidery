/**
 * Pure page accumulation for the keyset-paginated asset list.
 *
 * The list is cursor-paginated and unfiltered, so a concurrent upload can shift
 * the keyset window and make one asset appear on two pages. Rendering it twice
 * would be a lie about the collection, and re-sorting would move rows under the
 * operator's cursor — so the first occurrence wins and prior order is never
 * disturbed. `assetId` is the rendered identity.
 */
import type { AdminAssetDetailResponse, AdminAssetListResponse } from '@embroidery/api-client';

/**
 * Flattens accumulated pages in server order, keeping the first occurrence of
 * each `assetId`. Deterministic and side-effect free — it logs nothing, which
 * matters because a duplicate carries the same fields a log must never hold.
 */
export function flattenAssetPages(
  pages: readonly AdminAssetListResponse[],
): readonly AdminAssetDetailResponse[] {
  const seen = new Set<string>();
  const items: AdminAssetDetailResponse[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.assetId)) {
        continue;
      }
      seen.add(item.assetId);
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
export function resolveNextCursor(page: AdminAssetListResponse | undefined): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
