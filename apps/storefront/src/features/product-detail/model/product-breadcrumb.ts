import { buildDiscoverHref, DISCOVER_ROUTE, isCategorySlugShape } from '../../product-discovery';
import { PRODUCT_DETAIL_COPY } from './product-detail-copy';

/**
 * The one resolved Product Detail breadcrumb trail (`APP11-S04-C1`, corrected by
 * `APP12-C01-C1`).
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
 * ## The defect it originally corrected, and the one that replaced it
 *
 * `APP11-S04` linked `/kham-pha?category=<slug>` unconditionally, trusting a
 * contract that declared `PublicCategoryResponse.slug` a closed four-value enum.
 * The running database disagreed — it held a fifth category, `ao-thun`, and the
 * public read served it — so the page rendered, and advertised in structured
 * data, a URL Discover answered with its not-found boundary.
 *
 * `S04-C1` fixed that by checking the slug against the four Discover filters and
 * dropping the crumb when it did not match. That was right for its moment and
 * wrong as an end state: it made a **compiled list** the arbiter of which real
 * categories deserve a breadcrumb, so a category the operator publishes today
 * still loses its crumb until someone edits source. The store's own data was
 * being second-guessed by a constant.
 *
 * ## The rule now
 *
 * ```text
 * category.slug is a well-formed slug  ->  Khám phá / category.name / Product
 * anything else                        ->  Khám phá / Product
 * ```
 *
 * There is no membership test, because there is nothing legitimate to test
 * against: the category on a public Product response came from the `categories`
 * row the API joined, which is the same table Discover lists from. A Product is
 * only publicly visible when its category is published and not archived — the
 * public read enforces that in SQL — so a category that reaches this function
 * is, by construction, one `/kham-pha?category=` will render.
 *
 * What remains is a **syntax** guard, and it is not ceremony: the slug is
 * interpolated into a URL this page publishes to crawlers, and a malformed value
 * must not become an advertised address. That is a rule this app owns. Which
 * categories exist is not.
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
 * The category crumb's label is `category.name` — the operator's own text, from
 * the row — so renaming a category renames the crumb with no deployment. Every
 * emitted href goes through `buildDiscoverHref`, so the crumb, the Discover
 * chips and the sitemap's category URLs are composed by one builder and cannot
 * disagree about how a category is addressed.
 */
export function resolveProductBreadcrumb(
  product: ProductBreadcrumbSubject,
): readonly ProductBreadcrumbItem[] {
  const hasLinkableCategory =
    isCategorySlugShape(product.categorySlug) && product.categoryName !== '';

  return [
    { name: PRODUCT_DETAIL_COPY.discover, path: DISCOVER_ROUTE },
    ...(hasLinkableCategory
      ? [{ name: product.categoryName, path: buildDiscoverHref(product.categorySlug) }]
      : []),
    { name: product.name },
  ];
}
