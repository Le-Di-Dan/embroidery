/**
 * Storefront primary navigation model (APP1-S01A).
 *
 * The approved shell header (FIG-STOREFRONT-SHELL-*) presents a primary
 * navigation across the storefront's top-level discovery areas. None of those
 * routes exist yet — only the home route (`/`) is canonical — so every primary
 * item is rendered as **non-interactive** presentation with an explicit
 * "unavailable" affordance (see `storefront-primary-nav.tsx`). This preserves the
 * approved visual language without introducing a single dead anchor or an invented
 * route path (CLAUDE.md §5; APP1-S01A prompt §9). Real routes and `href`s are added
 * by the phases that own each area.
 */

/** The only canonical, implemented Storefront route today: the brand home link. */
export const STOREFRONT_HOME_ROUTE = '/';

/** A primary-navigation entry. `route` stays `null` until the area ships. */
export interface StorefrontNavItem {
  readonly id: string;
  readonly label: string;
  /** Reserved for the owning phase; `null` renders the item non-interactively. */
  readonly route: string | null;
}

/**
 * The approved-header primary navigation (canonical IA labels). Every route is
 * `null` in APP1-S01A: the areas are not built, so the items are presentation
 * only. Do not add an `href` here for a route that does not yet exist.
 */
export const STOREFRONT_PRIMARY_NAV: readonly StorefrontNavItem[] = [
  { id: 'discover', label: 'Khám phá', route: null },
  { id: 'collections', label: 'Bộ sưu tập', route: null },
  { id: 'studio', label: 'Studio', route: null },
  { id: 'commission', label: 'Đặt thêu', route: null },
  { id: 'journal', label: 'Nhật ký', route: null },
];
