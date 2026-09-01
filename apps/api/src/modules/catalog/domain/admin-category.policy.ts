/**
 * The operator-facing category rules (`APP12-C02`).
 *
 * `APP12-C01-C1` locked `CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE`: the rows
 * decide which categories exist. This module is the other half of that
 * sentence — **code decides what an operator may do to a row** — and it owns no
 * slug, no name and no ordering. Nothing here names a category.
 *
 * ## The lifecycle is strictly one-way
 *
 * ```text
 * DRAFT ──PUBLISH──> PUBLISHED ──ARCHIVE──> ARCHIVED
 * ```
 *
 * Two transitions, and no others. LC-04 (`DB3_LIFECYCLE_SPECIFICATIONS.md`
 * §TR-LC04) authorises more for the publication machine categories share with
 * Products — `ARCHIVED → PUBLISHED` (relist, TR-LC04-04) and `DRAFT → ARCHIVED`
 * (retire an unpublished draft, TR-LC04-06). Neither is *required* of this
 * surface, and `APP12-C02` deliberately does not deliver them: a relist would
 * have to answer what happens to the Products left behind under the archived
 * category, and retiring a draft that was never public is a delete-shaped need
 * with no operator screen behind it. Not implementing an authorised transition
 * narrows the surface; it does not contradict the lifecycle. Implementing one
 * the lifecycle forbids would.
 *
 * ## What the two transitions cost
 *
 * `PUBLISH` makes the row visible to every anonymous caller on the next read.
 * `ARCHIVE` withdraws it — and is refused while a PUBLISHED Product still
 * depends on it, because delisting a category out from under a live Product
 * page is a broken storefront, not a taxonomy edit. There is no fallback
 * category to move those Products to, and none is invented: the operator
 * reassigns or unpublishes them first.
 */
import type { CategoryState } from '@embroidery/database';

/** The state every new category starts in. The client may never choose it. */
export const CATEGORY_INITIAL_STATE = 'DRAFT' as const satisfies CategoryState;

/** The one state that makes a category publicly browsable and Product-assignable. */
export const CATEGORY_PUBLISHED_STATE = 'PUBLISHED' as const satisfies CategoryState;

/** The terminal state of this surface. There is no hard delete in APP12. */
export const CATEGORY_ARCHIVED_STATE = 'ARCHIVED' as const satisfies CategoryState;

/**
 * The transition vocabulary the Admin contract publishes.
 *
 * Actions, not target states: `POST .../transitions` names *what the operator
 * is doing*, and the server decides which state that lands in. A body that
 * named `PUBLISHED` directly would let a future third path into the same state
 * arrive with no name of its own.
 */
export const CATEGORY_TRANSITION_ACTIONS = ['PUBLISH', 'ARCHIVE'] as const;
export type CategoryTransitionAction = (typeof CATEGORY_TRANSITION_ACTIONS)[number];

/** The one legal source state and the resulting state, per action. */
export const CATEGORY_TRANSITIONS: Readonly<
  Record<CategoryTransitionAction, { readonly from: CategoryState; readonly to: CategoryState }>
> = {
  PUBLISH: { from: CATEGORY_INITIAL_STATE, to: CATEGORY_PUBLISHED_STATE },
  ARCHIVE: { from: CATEGORY_PUBLISHED_STATE, to: CATEGORY_ARCHIVED_STATE },
};

/**
 * The states in which `slug` may still change.
 *
 * `DRAFT` only. A published slug is a public URL key: the Storefront filters
 * on it, the sitemap advertises it and a customer may have bookmarked it. This
 * checkpoint delivers no re-slugging, no redirect table and no alias, so the
 * honest contract is that publication freezes the address. An operator who
 * needs a different address publishes a different category.
 */
export const CATEGORY_SLUG_MUTABLE_STATES = [CATEGORY_INITIAL_STATE] as const;

export function isSlugMutable(status: string): boolean {
  return (CATEGORY_SLUG_MUTABLE_STATES as readonly string[]).includes(status);
}

/**
 * Bounds on the operator-authored text.
 *
 * `categories.name` is `text` with no column limit, so this is policy: a
 * navigation label that does not fit on a chip is a data-entry accident, not a
 * category.
 */
export const CATEGORY_NAME_MAX_LENGTH = 120;

/**
 * The `display_order` range the contract accepts.
 *
 * The column is a plain `integer` with no CHECK, and ordering is **sparse** —
 * nothing in the schema or in `0033` makes positions contiguous, and this
 * surface deliberately does not renumber siblings when one moves. Renumbering
 * would rewrite rows the operator did not touch, and `(display_order, slug)` is
 * already a total order without it.
 */
export const CATEGORY_DISPLAY_ORDER_MIN = 0;
export const CATEGORY_DISPLAY_ORDER_MAX = 100_000;

/**
 * The safety bound on one Admin inventory response.
 *
 * Larger than the public cap because this list carries drafts and archived rows
 * as well, and for the same reason: the Admin list is an inventory, not a feed,
 * so a taxonomy that outgrew one response must be detectable rather than
 * silently truncated. The repository is asked for `cap + 1` rows.
 */
export const ADMIN_CATEGORY_MAX_ENTRIES = 1_000;

/**
 * The Admin list ordering: `display_order` ascending, then `slug` ascending.
 *
 * The same rule the public inventory uses, and for the same reason — the
 * operator must see the taxonomy in the order the store presents it, and `slug`
 * is the unique tie-breaker (CST-011) that makes the order total. Status is
 * deliberately not a sort key: grouping drafts away from published rows is a
 * screen decision `APP12-A01` may make from the field it already receives.
 */
export const ADMIN_CATEGORY_ORDER = ['displayOrder', 'slug'] as const;
