import { buildDiscoverHref, DISCOVER_ROUTE, toDiscoverCategorySlug } from '../../product-discovery';
import { PRODUCT_DETAIL_COPY } from './product-detail-copy';

/**
 * The one resolved Product Detail breadcrumb trail (`APP11-S04-C1`).
 *
 * ## Why this model exists
 *
 * `APP11-S04` restated the visible breadcrumb as `BreadcrumbList` structured
 * data by rebuilding the item list a second time, in the route segment. The two
 * lists agreed, and both were wrong in the same way — which is exactly the
 * failure a second list produces. Now there is one sequence: the rendered
 * `<nav>` and the JSON-LD are two consumers of this function, and a category
 * decision taken here cannot be taken differently over there.
 *
 * ## The defect it corrects
 *
 * A Product carries a Catalog category (`category.slug`), and Discover filters
 * on a closed set of four slugs. On paper those are the *same* set: the
 * committed OpenAPI artifact declares `PublicCategoryResponse.slug` as the enum
 * `thu-bong | khan | quan-ao | khac`, exactly matching
 * `PublicProductListCategorySlug`, and the generated types say a Product outside
 * it cannot exist.
 *
 * The running system disagrees. `categories.slug` is an unconstrained `text`
 * column with only a uniqueness index, the database holds a fifth category
 * `ao-thun`, and `GET /api/public/products/ao-thun-cotton` returns it. So
 * `APP11-S04` — which trusted the declared type and linked
 * `/kham-pha?category=<slug>` unconditionally — both rendered and *advertised in
 * structured data* a URL Discover answers with its not-found boundary. A
 * structured-data trail whose intermediate item is not a navigable page is worse
 * than no trail: it tells a crawler the store's own navigation is broken.
 *
 * That divergence between the published contract and the persisted data is a
 * backend concern, recorded as `FU-APP11-S04-C1-02` and deliberately not fixed
 * here. This module's job is narrower and holds either way: a URL this page
 * publishes must resolve, and that is checked rather than assumed. Validating at
 * the boundary is correct even when the type says validation is unnecessary —
 * here it is demonstrably not.
 *
 * ## The rule
 *
 * ```text
 * category slug is one of the four Discover filters  ->  Khám phá / category / Product
 * anything else                                      ->  Khám phá / Product
 * ```
 *
 * The non-canonical case drops the crumb rather than repairing it. There is
 * **no mapping** from `ao-thun` to `quan-ao` or to anything else: no repository
 * authority defines one, and inventing a coarse taxonomy here would be this
 * module deciding what the catalogue means. Two levels is the honest trail —
 * `Khám phá` really is where this Product was reached from, and it really does
 * resolve.
 *
 * The membership test is `toDiscoverCategorySlug`, the same narrowing the
 * `/kham-pha` route uses to decide whether a `?category=` value is real. One
 * predicate means a crumb can only ever be built for a state the route will
 * actually render, and a contract change moves both at once.
 *
 * ## What is not decided here
 *
 * The Product's category is still a fact about the Product, and the parts of the
 * page with an independent use for it — `Tiếp tục khám phá`, the identity block
 * — are untouched. This module answers one question: what the *breadcrumb* may
 * claim is a route.
 */

/** One crumb. `path` is absent for the current page, which is never a link. */
export interface ProductBreadcrumbItem {
  readonly name: string;
  readonly path?: string;
}

/** The facts a trail is built from — no ids, no SEO fields, no media. */
export interface ProductBreadcrumbSubject {
  readonly name: string;
  readonly categoryName: string;
  readonly categorySlug: string;
}

/**
 * Resolves the trail for one Product.
 *
 * The last item deliberately carries no `path`: it is the page the visitor is
 * already on, which is why the visible crumb is text rather than a link and why
 * the JSON-LD item has no `item` URL.
 *
 * Every emitted category href goes through `buildDiscoverHref`, so the crumb,
 * the Discover chips and the sitemap's four category URLs are all composed by
 * one builder and cannot disagree about how a category is addressed.
 */
export function resolveProductBreadcrumb(
  product: ProductBreadcrumbSubject,
): readonly ProductBreadcrumbItem[] {
  const canonicalSlug = toDiscoverCategorySlug(product.categorySlug);

  return [
    { name: PRODUCT_DETAIL_COPY.discover, path: DISCOVER_ROUTE },
    ...(canonicalSlug === undefined
      ? []
      : [{ name: product.categoryName, path: buildDiscoverHref(canonicalSlug) }]),
    { name: product.name },
  ];
}
