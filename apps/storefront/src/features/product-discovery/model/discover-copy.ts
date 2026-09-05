/**
 * Vietnamese copy catalog for the Discover feed (`APP2-S01`).
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14). Nothing in this
 * catalog promises a capability the backend does not have: there is no search
 * copy, no collection copy, no result count and no commission call to action,
 * because `APP2-B04` exposes only an unfiltered/category-filtered listing with
 * keyset continuation.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `discover`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const discoverMessage = messageView(VI_MESSAGES.storefront, 'discover');

export const DISCOVER_COPY = {
  /** The page's single `<h1>`. */
  heading: discoverMessage.text('heading'),
  intro: discoverMessage.text('intro'),
  /** Accessible name for the category chip navigation. */
  categoryNavLabel: discoverMessage.text('categoryNavLabel'),
  /**
   * The unfiltered chip. UI state, not a category: it means "send no
   * `category` parameter". It lives in the copy catalog rather than beside the
   * category model because it is the one label on that row that is *not* data
   * (`APP12-C01-C1`).
   */
  categoryAllLabel: discoverMessage.text('categoryAllLabel'),
  /** Shown in place of the chip row when the category inventory cannot be read. */
  categoryUnavailable: discoverMessage.text('categoryUnavailable'),
  /** Accessible name for the feed collection. */
  feedLabel: discoverMessage.text('feedLabel'),
  initialLoading: discoverMessage.text('initialLoading'),
  emptyUnfiltered: {
    heading: discoverMessage.text('emptyUnfiltered.heading'),
    body: discoverMessage.text('emptyUnfiltered.body'),
  },
  emptyFiltered: {
    heading: discoverMessage.text('emptyFiltered.heading'),
    body: discoverMessage.text('emptyFiltered.body'),
    action: discoverMessage.text('emptyFiltered.action'),
  },
  initialError: {
    heading: discoverMessage.text('initialError.heading'),
    body: discoverMessage.text('initialError.body'),
    action: discoverMessage.text('initialError.action'),
  },
  continuation: {
    loading: discoverMessage.text('continuation.loading'),
    error: discoverMessage.text('continuation.error'),
    retry: discoverMessage.text('continuation.retry'),
    end: discoverMessage.text('continuation.end'),
    /** Visible fallback when IntersectionObserver is unavailable. */
    loadMore: discoverMessage.text('continuation.loadMore'),
  },
  card: {
    /**
     * Screen-reader text for a product with no deliverable thumbnail. The card
     * shows a neutral placeholder — never a fabricated URL and never the
     * catalog-preview rendition, which is a detail-page derivative.
     */
    imageMissing: discoverMessage.text('card.imageMissing'),
  },
} as const;

/**
 * The metadata title stem for a category-filtered Discover feed (`APP12-C03`).
 *
 * The category half is `category.name` — the operator's own text, read from the
 * row — never a label rebuilt from the slug and never invented SEO copy. The
 * Discover heading stays in the title so a filtered feed still reads as part of
 * `Khám phá` rather than as a page of its own.
 *
 * Deterministic: one category produces one title on every render, so two crawls
 * of the same URL never disagree.
 */
export function discoverCategoryTitle(categoryName: string): string {
  return `${categoryName} — ${DISCOVER_COPY.heading}`;
}

/** Alt text for a product thumbnail, derived from the product name only. */
export function thumbnailAlt(productName: string): string {
  return productName;
}
