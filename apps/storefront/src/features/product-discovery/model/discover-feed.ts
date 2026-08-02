import type {
  PublicProductListResponse,
  PublicProductSummaryResponse,
} from '@embroidery/api-client';

/**
 * Projection of the API list item onto what the Discover card may render.
 *
 * This is a narrowing, not a rename. `APP2-B04` also returns `price` and
 * `isDisplayOutOfStock`; UI02 is image-led discovery rather than a shop listing,
 * so those fields are dropped **here** — at the boundary — instead of being
 * carried into the component tree and merely left unrendered. A field a
 * component cannot see is a field it cannot leak.
 */
export interface DiscoverCard {
  /** Immutable server-owned identity; used as the React key. */
  readonly slug: string;
  readonly name: string;
  readonly categoryName: string;
  /**
   * Relative, same-origin thumbnail path exactly as the API returned it, or
   * `undefined` when this product has no deliverable thumbnail. Never rewritten,
   * never composed locally, and never persisted beyond the current query result:
   * media associations are replaced wholesale when an operator edits a product's
   * images, so a stored path can outlive the object it names.
   */
  readonly thumbnailUrl?: string;
}

export function toDiscoverCard(item: PublicProductSummaryResponse): DiscoverCard {
  const thumbnailUrl = item.thumbnail?.url;
  return {
    slug: item.slug,
    name: item.name,
    categoryName: item.category.name,
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
  };
}

/**
 * Flattens keyset pages into one feed in server order, dropping any product that
 * has already appeared.
 *
 * Keeping the **first** occurrence is what preserves editorial order: a product
 * republished between two page requests can legitimately surface again under a
 * later cursor, and re-appending it would both duplicate the card and shift the
 * visitor's reading position. Deduplicating by `slug` is safe because the slug
 * is the server's immutable identity for a product.
 */
export function flattenDiscoverPages(pages: readonly PublicProductListResponse[]): DiscoverCard[] {
  const seen = new Set<string>();
  const cards: DiscoverCard[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      cards.push(toDiscoverCard(item));
    }
  }
  return cards;
}

/**
 * The cursor for the next request, or `undefined` when the feed is exhausted.
 *
 * Both conditions are required. `hasNext` alone would let a malformed page
 * (`hasNext: true`, `nextCursor: null`) drive an endless request with no cursor,
 * and a non-null cursor alone would keep requesting past the final page.
 */
export function nextCursorOf(page: PublicProductListResponse | undefined): string | undefined {
  if (page === undefined) return undefined;
  if (!page.hasNext) return undefined;
  return page.nextCursor === null || page.nextCursor === '' ? undefined : page.nextCursor;
}
