import Link from 'next/link';

import { buildDiscoverHref, DISCOVER_ROUTE } from '../../product-discovery';
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
 */
export function DetailContinueDiscover({
  categoryName,
  categorySlug,
}: DetailContinueDiscoverProps) {
  return (
    <section className="product-detail__continue" aria-labelledby="product-detail-continue-heading">
      <h2 className="product-detail__continue-heading" id="product-detail-continue-heading">
        {PRODUCT_DETAIL_COPY.continueHeading}
      </h2>
      <div className="product-detail__continue-links">
        <Link className="product-detail__continue-link" href={DISCOVER_ROUTE}>
          {PRODUCT_DETAIL_COPY.continueAll}
        </Link>
        <Link className="product-detail__continue-link" href={buildDiscoverHref(categorySlug)}>
          {continueInCategoryLabel(categoryName)}
        </Link>
      </div>
    </section>
  );
}
