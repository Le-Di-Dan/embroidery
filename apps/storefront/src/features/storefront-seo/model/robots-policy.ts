import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE,
  STOREFRONT_STUDIO_ROUTE_SEGMENT,
} from '../../storefront-shell';

/**
 * The crawl boundary published at `/robots.txt` (`APP11-S04`).
 *
 * ## `robots.txt` does not replace `noindex`
 *
 * The two controls answer different questions and neither substitutes for the
 * other. A `Disallow` asks a crawler not to *fetch* a URL; it does not remove an
 * already-known address from an index, and a page that is never fetched can
 * never have its `noindex` read. Every private route therefore keeps its own
 * page-level `robots: { index: false }` — this file is a second, coarser fence
 * around the same routes, not the fence.
 *
 * ## What is disallowed, and why by family
 *
 * The four private families, named by their route roots rather than enumerated
 * page by page: a customer secure-access surface (`/truy-cap`), contact
 * verification, the custom-request flow, and the per-Product Studio. A prefix
 * covers the pages that exist and the ones a later checkpoint adds beneath them,
 * which is the failure mode an enumerated list has.
 *
 * ## What is deliberately *not* disallowed
 *
 * `/san-pham/*` and `/bo-suu-tap/*` as a whole. A Product or gallery entry the
 * operator marked `noindex` is still a public, readable page — indexability is
 * not visibility — and the indexing decision belongs to that page's own robots
 * directive, per entity. Blocking the family here would take a per-entity
 * operator decision away and apply it to every sibling.
 *
 * The Admin application is not mentioned either. It is a separate hostname with
 * its own document root; writing Admin paths into the Storefront's robots file
 * would neither protect them nor even address them, and would publish a map of
 * an application this host does not serve.
 *
 * Nothing here carries an environment value, a token or an internal hostname.
 */

/** The one user-agent group: the rules are identical for every crawler. */
export const ROBOTS_USER_AGENT = '*';

/** Public and crawlable — the whole site except the families below. */
export const ROBOTS_ALLOW = '/';

/**
 * The Studio pattern. A wildcard is needed because the segment sits *under* a
 * per-Product path, so there is no fixed prefix to disallow; `*` in a path is
 * supported by every major crawler and by the framework's robots serializer.
 */
export const ROBOTS_STUDIO_PATTERN = `${STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE}/*/${STOREFRONT_STUDIO_ROUTE_SEGMENT}`;

/** The secure customer-access root (`APP4-S02` and everything beneath it). */
export const ROBOTS_SECURE_ACCESS_PREFIX = '/truy-cap';

/** The contact-verification screen (`APP4-S01`). */
export const ROBOTS_VERIFICATION_PREFIX = '/xac-minh-lien-he';

/**
 * The custom-request family root. Derived from the delivered route rather than
 * written as a literal, so it cannot drift from where the flow actually lives:
 * `/yeu-cau/moi` and `/yeu-cau/da-gui` both sit under `/yeu-cau`.
 */
export const ROBOTS_REQUEST_PREFIX = STOREFRONT_CUSTOM_REQUEST_ROUTE.slice(
  0,
  STOREFRONT_CUSTOM_REQUEST_ROUTE.indexOf('/', 1),
);

/** Every disallowed path or pattern, in the order robots.txt lists them. */
export const ROBOTS_DISALLOW: readonly string[] = [
  ROBOTS_SECURE_ACCESS_PREFIX,
  ROBOTS_VERIFICATION_PREFIX,
  ROBOTS_REQUEST_PREFIX,
  ROBOTS_STUDIO_PATTERN,
];

/** The one sitemap this host advertises. */
export const SITEMAP_PATH = '/sitemap.xml';
