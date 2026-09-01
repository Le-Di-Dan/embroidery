import { DISCOVER_ROUTE } from '../../product-discovery';
import { STOREFRONT_POLICY_PAGES } from '../../content-pages/model/policies/policy-resolver';
import {
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_HOME_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
} from '../../storefront-shell/model/storefront-navigation';

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
 * Every entry here is a route with a `page.tsx` behind it. `APP11-S05` built
 * the four content pages and, in the same change, appended their **seven**
 * concrete URLs below — the seam working as designed: the array grew,
 * `sitemap.ts` was not touched.
 *
 * Seven, not four, because `/chinh-sach/[slug]` is one route file and four
 * addresses. The parameterised path itself is **never** advertised: a literal
 * `/chinh-sach/[slug]` in a sitemap is a URL that 404s for every crawler that
 * fetches it. Nor is `/chinh-sach` — that directory holds no `page.tsx`, and
 * advertising a URL because a folder exists is the same defect in a different
 * disguise.
 *
 * The four policy URLs come from `STOREFRONT_POLICY_PAGES`, the same ordered set
 * the resolver matches against and the footer column links, so the sitemap
 * cannot advertise a policy that does not resolve and cannot omit one that does.
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
 * ## The category URLs are **not** here
 *
 * `/kham-pha?category=<slug>` is the canonical address of a filtered Discover
 * feed (IMP-D038, `APP2-S01-G01`) — there is no `/danh-muc/[slug]` — so a
 * category state is a real, indexable URL and belongs in the sitemap. It does
 * **not** belong in this array, because the set of categories is not fixed:
 * it is rows in `categories`, read at request time
 * (`APP12-C01-C1`). This module is for routes that exist because a `page.tsx`
 * exists; a category URL exists because an operator published a row.
 *
 * The four category URLs that used to sit here were compiled from a contract
 * enum, so a category published after the build never reached a crawler and one
 * archived after the build kept being advertised. `sitemap-composition.ts` now
 * takes the live indexable inventory as its own argument.
 */

/** One fixed public URL path, root-relative. */
export interface PublicStaticRoute {
  /** Stable id for tests and for a future S05 entry to be named by. */
  readonly id: string;
  /** Root-relative path, query state included where it is canonical. */
  readonly path: string;
}

/**
 * The id of the Discover route, named so the composer can place the
 * database-derived category URLs immediately after it without depending on this
 * array's positions (`APP12-C01-C1`).
 */
export const DISCOVER_ROUTE_ID = 'discover';

/**
 * The inventory, in route authority order: home, Discover, the gallery feed,
 * then the `APP11-S05` content pages — Service, FAQ, Local, and the four
 * policies in canonical policy order. The order is the sitemap's own static
 * ordering (see `sitemap-composition.ts`), so it is a decision recorded here
 * rather than an accident of how the array was appended to.
 *
 * The database-derived category URLs are inserted **after** `discover` by the
 * composer, which is where the three sources — fixed routes, category rows,
 * dynamic entities — are ordered against each other.
 *
 * The S05 entries carry no `lastModified` either, for the reason above: static
 * copy has no authoring timestamp, and the build time would be a freshness claim
 * renewed on every deployment.
 */
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[] = [
  { id: 'home', path: STOREFRONT_HOME_ROUTE },
  { id: DISCOVER_ROUTE_ID, path: DISCOVER_ROUTE },
  { id: 'gallery', path: STOREFRONT_GALLERY_ROUTE },
  { id: 'service', path: STOREFRONT_SERVICE_ROUTE },
  { id: 'faq', path: STOREFRONT_FAQ_ROUTE },
  { id: 'store', path: STOREFRONT_STORE_ROUTE },
  ...STOREFRONT_POLICY_PAGES.map((policy) => ({ id: policy.id, path: policy.path })),
];
