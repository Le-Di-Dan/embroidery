import Link from 'next/link';

import { buildDiscoverHref, DISCOVER_ROUTE, toDiscoverCategorySlug } from '../../product-discovery';
import { continueInCategoryLabel, PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

interface DetailContinueDiscoverProps {
  readonly categoryName: string;
  readonly categorySlug: string;
}

/**
 * `Tiếp tục khám phá` — the truthful replacement for the draft's related feed.
 *
 * UI03 drew eight related works with filter tabs. There is **no related-Product
 * operation** anywhere in the API, and inventing one client-side (fetch the
 * list, drop the current Product, show four) would be a recommendation the
 * studio never made, dressed up as one they did.
 *
 * Two real links instead: everything, and this Product's own category. Both go
 * through the S01 href builder, and neither costs an extra request.
 *
 * ## The category link only promises a category Discover can render
 * (`FU-APP11-S04-C1-01`, repaired at `APP11-S05`)
 *
 * A Product's `categorySlug` is whatever the API returned, and the running API
 * can return one outside the closed Discover enum: the `ao-thun-cotton` fixture
 * carries `ao-thun`, which `/kham-pha` rejects. The link was built from that
 * value unconditionally, so this CTA — the page's own invitation to keep
 * browsing — landed the visitor on a 404.
 *
 * `APP11-S04-C1` already solved the identical problem for the breadcrumb, with
 * `toDiscoverCategorySlug`: the same narrowing `/kham-pha` itself uses to decide
 * whether a `?category=` value is real. Applying it here means one predicate
 * decides what may be linked, so a crumb and a continuation CTA can never
 * disagree about whether a category is addressable, and a contract change moves
 * both at once.
 *
 * The two branches differ in destination, never in presence. A non-canonical
 * category still gets a second link — to unfiltered Discover, the one state that
 * always renders — because deleting the CTA would let a data defect quietly
 * remove a section of an approved design. The label keeps naming the category,
 * which stays true: the Product *is* in it; only the filtered feed is not an
 * address.
 *
 * This is the Storefront half of the containment. The divergence itself —
 * committed OpenAPI declaring a closed enum the running API does not honour —
 * is `FU-APP11-S04-C1-02`, a backend/contract decision routed to `APP11-E01`
 * and deliberately not repaired from here.
 */
export function DetailContinueDiscover({
  categoryName,
  categorySlug,
}: DetailContinueDiscoverProps) {
  const canonicalSlug = toDiscoverCategorySlug(categorySlug);
  const categoryHref =
    canonicalSlug === undefined ? DISCOVER_ROUTE : buildDiscoverHref(canonicalSlug);

  return (
    <section className="product-detail__continue" aria-labelledby="product-detail-continue-heading">
      <h2 className="product-detail__continue-heading" id="product-detail-continue-heading">
        {PRODUCT_DETAIL_COPY.continueHeading}
      </h2>
      <div className="product-detail__continue-links">
        <Link className="product-detail__continue-link" href={DISCOVER_ROUTE}>
          {PRODUCT_DETAIL_COPY.continueAll}
        </Link>
        <Link className="product-detail__continue-link" href={categoryHref}>
          {continueInCategoryLabel(categoryName)}
        </Link>
      </div>
    </section>
  );
}
