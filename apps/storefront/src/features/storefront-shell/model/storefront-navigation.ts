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

/**
 * The canonical Product Detail route base (IMP-D039, `APP2-S02-G01`).
 *
 * `/product/*`, `/products/*`, `/catalog/*`, `/tac-pham/*` and `/kham-pha/*` are
 * rejected as detail aliases and no redirect is approved. IMP-D038 had left this
 * path a Figma proposal; the Product Owner locked it only after the UI03
 * reconciliation, which is why it appears here and not in `APP2-S01`.
 */
export const STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE = '/san-pham';

/**
 * The one place a Product Detail URL is built.
 *
 * Both the Discover card link and the detail page's own canonical/share URL go
 * through this, so a change to the address cannot land in one and be missed in
 * the other. The slug is server-owned and already restricted to `[a-z0-9-]` by
 * `isPublicProductSlug`; encoding it anyway is a second barrier rather than the
 * only one, and it keeps a caller that skipped validation from writing a raw
 * `?`, `#` or `/` into the path.
 */
export function buildStorefrontProductDetailPath(slug: string): string {
  return `${STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE}/${encodeURIComponent(slug)}`;
}

/**
 * The canonical Studio segment, appended to one Product Detail path
 * (`APP3-S01`).
 *
 * The Studio is entered **through a Product**, because a design session is
 * opened on one exact `product → side → area` placement and nothing in the
 * public contract addresses a session without one. That is why `/studio`,
 * `/editor`, `/thiet-ke/[id]` and `/design-session/[sessionId]` are rejected:
 * each of them implies a Studio that exists apart from a Product, and none of
 * them can name the placement the API requires.
 *
 * Side and Area are **not** path authority. They are chosen inside the route
 * from the public placement manifest, deterministically when there is only one
 * of each, so a shared link can never pin a Side that has since been retired.
 */
export const STOREFRONT_STUDIO_ROUTE_SEGMENT = 'thiet-ke';

/**
 * The one place a Studio URL is built — the Product Detail path plus the Studio
 * segment, so the two addresses cannot drift apart.
 */
export function buildStorefrontStudioPath(slug: string): string {
  return `${buildStorefrontProductDetailPath(slug)}/${STOREFRONT_STUDIO_ROUTE_SEGMENT}`;
}

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
 *
 * `studio` stays `route: null` after `APP3-S01`, and that is the correct
 * outcome rather than an oversight. S01 built a Studio *per Product*; there is
 * no Studio landing page, so any `href` here would have to invent one.
 */
export const STOREFRONT_PRIMARY_NAV: readonly StorefrontNavItem[] = [
  { id: 'discover', label: 'Khám phá', route: STOREFRONT_DISCOVER_ROUTE },
  { id: 'collections', label: 'Bộ sưu tập', route: null },
  { id: 'studio', label: 'Studio', route: null },
  { id: 'commission', label: 'Đặt thêu', route: null },
  { id: 'journal', label: 'Nhật ký', route: null },
];
