/**
 * Storefront primary navigation model (APP1-S01A; Discover activated by
 * `APP2-S01`).
 *
 * The approved shell header (FIG-STOREFRONT-SHELL-*) presents a primary
 * navigation across the storefront's top-level discovery areas. An item is
 * rendered as a real link once — and only once — its route exists; the rest stay
 * **non-interactive** presentation with an explicit "unavailable" affordance
 * (see `storefront-primary-nav.tsx`). This preserves the approved visual language
 * without introducing a single dead anchor or an invented route path
 * (CLAUDE.md §5; APP1-S01A prompt §9). Real routes and `href`s are added by the
 * phases that own each area.
 */

/** The canonical Storefront home route; the brand link targets it. */
export const STOREFRONT_HOME_ROUTE = '/';

/**
 * The canonical Discover route (IMP-D038, `APP2-S01-G01`). Product Owner
 * authority, not a Figma label: `/` stays Homepage-owned and `/discover`,
 * `/catalog`, `/products` and `/san-pham` are rejected, with no alias and no
 * redirect approved. Routes are shell IA, so this is the single place the path
 * is written; the discovery feature composes its category URLs from here.
 */
export const STOREFRONT_DISCOVER_ROUTE = '/kham-pha';

/** A primary-navigation entry. `route` stays `null` until the area ships. */
export interface StorefrontNavItem {
  readonly id: string;
  readonly label: string;
  /** Reserved for the owning phase; `null` renders the item non-interactively. */
  readonly route: string | null;
}

/**
 * The approved-header primary navigation (canonical IA labels). Only `discover`
 * has a route: `APP2-S01` built it. The other four areas are not built, so their
 * items stay presentation only. Do not add an `href` here for a route that does
 * not yet exist.
 */
export const STOREFRONT_PRIMARY_NAV: readonly StorefrontNavItem[] = [
  { id: 'discover', label: 'Khám phá', route: STOREFRONT_DISCOVER_ROUTE },
  { id: 'collections', label: 'Bộ sưu tập', route: null },
  { id: 'studio', label: 'Studio', route: null },
  { id: 'commission', label: 'Đặt thêu', route: null },
  { id: 'journal', label: 'Nhật ký', route: null },
];
