import Link from 'next/link';

import { buildDiscoverHref, DISCOVER_ROUTE, isCategorySlugShape } from '../../product-discovery';
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
 * A Product's `categorySlug` is whatever the API returned. `APP11-S04` built
 * this link from it unconditionally while the committed contract declared a
 * closed four-value enum the running API did not honour — the `ao-thun-cotton`
 * fixture carried `ao-thun` — so this CTA, the page's own invitation to keep
 * browsing, landed the visitor on a 404.
 *
 * `APP11-S04-C1` contained that by narrowing the slug against the four Discover
 * filters. `APP12-C01-C1` removes the underlying divergence instead: the
 * category set is the `categories` table, Discover lists from it, and a Product
 * is only publicly visible when its category is published and not archived — the
 * public read enforces that in SQL. A category slug reaching this component is
 * therefore one `/kham-pha?category=` will render, and asking a compiled list
 * for permission would only re-create the defect from the other side: a category
 * the operator published today would lose its filtered link until someone
 * edited source.
 *
 * What remains is a **syntax** guard on a value being interpolated into a URL —
 * a rule this app owns. Which categories exist is not.
 *
 * The two branches differ in destination, never in presence. A malformed
 * category still gets a second link — to unfiltered Discover, the one state that
 * always renders — because deleting the CTA would let a data defect quietly
 * remove a section of an approved design. The label keeps naming the category,
 * which stays true: the Product *is* in it.
 */
export function DetailContinueDiscover({
  categoryName,
  categorySlug,
}: DetailContinueDiscoverProps) {
  const categoryHref = isCategorySlugShape(categorySlug)
    ? buildDiscoverHref(categorySlug)
    : DISCOVER_ROUTE;

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
