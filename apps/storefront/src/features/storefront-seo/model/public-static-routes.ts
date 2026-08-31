import {
  buildDiscoverHref,
  DISCOVER_CATEGORY_SLUGS,
  DISCOVER_ROUTE,
} from '../../product-discovery';
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
 * category states, the gallery feed, then the `APP11-S05` content pages —
 * Service, FAQ, Local, and the four policies in canonical policy order. The
 * order is the sitemap's own static ordering (see `sitemap-composition.ts`), so
 * it is a decision recorded here rather than an accident of how the array was
 * appended to.
 *
 * The S05 entries carry no `lastModified` either, for the reason above: static
 * copy has no authoring timestamp, and the build time would be a freshness claim
 * renewed on every deployment.
 */
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[] = [
  { id: 'home', path: STOREFRONT_HOME_ROUTE },
  { id: 'discover', path: DISCOVER_ROUTE },
  ...DISCOVER_CATEGORY_SLUGS.map((slug) => ({
    id: `discover-category-${slug}`,
    path: buildDiscoverHref(slug),
  })),
  { id: 'gallery', path: STOREFRONT_GALLERY_ROUTE },
  { id: 'service', path: STOREFRONT_SERVICE_ROUTE },
  { id: 'faq', path: STOREFRONT_FAQ_ROUTE },
  { id: 'store', path: STOREFRONT_STORE_ROUTE },
  ...STOREFRONT_POLICY_PAGES.map((policy) => ({ id: policy.id, path: policy.path })),
];
