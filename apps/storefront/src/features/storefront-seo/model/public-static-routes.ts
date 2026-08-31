import {
  buildDiscoverHref,
  DISCOVER_CATEGORY_SLUGS,
  DISCOVER_ROUTE,
} from '../../product-discovery';
import { STOREFRONT_GALLERY_ROUTE, STOREFRONT_HOME_ROUTE } from '../../storefront-shell';

/**
 * The public, indexable Storefront routes that are **not** dynamic entities
 * (`APP11-S04`).
 *
 * ## Why this list exists at all
 *
 * `APP11-B04` is deliberately path-agnostic: the API publishes `{ kind, slug }`
 * for Products and gallery entries and knows nothing about `/kham-pha`, `/` or
 * any other fixed page, because browser routes are Storefront authority. So the
 * static half of the sitemap has to be declared somewhere in this app, and this
 * is the single place it is written.
 *
 * ## Only what exists today
 *
 * Every entry here is a route with a `page.tsx` behind it at S04 exit. The four
 * `APP11-S05` content pages — `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang`,
 * `/chinh-sach/[slug]` — are absent on purpose: advertising a URL before it
 * renders tells a crawler the store is broken, and creating the pages early
 * merely to make an entry valid would be S05's work done badly. S05 extends this
 * array; it does not rewrite `sitemap.ts`, which is the whole point of the seam.
 *
 * ## No `lastModified`, no `priority`, no `changeFrequency`
 *
 * A static route has no authoring timestamp in this system. `Date.now()`, the
 * build time or the request time would each be a fabricated freshness claim
 * renewed on every crawl, which is worse than the absent field a crawler already
 * knows how to handle. `priority` and `changeFrequency` are omitted for the same
 * reason: no canonical SEO authority in this repository sets either, and a
 * number invented here would quietly become that authority.
 *
 * ## The category URLs are query state, not routes
 *
 * `/kham-pha?category=<slug>` is the canonical address of a filtered Discover
 * feed (IMP-D038, `APP2-S01-G01`) — there is no `/danh-muc/[slug]`. The four
 * slugs come from the contract enum through `DISCOVER_CATEGORY_SLUGS`, never a
 * hand-kept list, so a contract change is a build failure rather than a sitemap
 * advertising a category that 404s.
 */

/** One fixed public URL path, root-relative. */
export interface PublicStaticRoute {
  /** Stable id for tests and for a future S05 entry to be named by. */
  readonly id: string;
  /** Root-relative path, query state included where it is canonical. */
  readonly path: string;
}

/**
 * The inventory, in route authority order: home, Discover, its four canonical
 * category states, then the gallery feed. The order is the sitemap's own static
 * ordering (see `sitemap-composition.ts`), so it is a decision recorded here
 * rather than an accident of how the array was appended to.
 */
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[] = [
  { id: 'home', path: STOREFRONT_HOME_ROUTE },
  { id: 'discover', path: DISCOVER_ROUTE },
  ...DISCOVER_CATEGORY_SLUGS.map((slug) => ({
    id: `discover-category-${slug}`,
    path: buildDiscoverHref(slug),
  })),
  { id: 'gallery', path: STOREFRONT_GALLERY_ROUTE },
];
