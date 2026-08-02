import Link from 'next/link';

import { buildDiscoverHref, DISCOVER_ROUTE } from '../../product-discovery';
import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

interface DetailBreadcrumbProps {
  readonly name: string;
  readonly categoryName: string;
  readonly categorySlug: string;
}

/**
 * Navigation back into Discover.
 *
 * Desktop and tablet show the full trail; mobile shows a single back link, which
 * is the approved composition (`529:2575`) rather than a squeezed three-level
 * trail. Both are rendered and CSS shows one per viewport — `display: none`
 * removes the other from the accessibility tree too, so assistive technology
 * hears exactly one route back, not two.
 *
 * The current Product is text, not a link: a breadcrumb item pointing at the
 * page you are already on is a dead control that costs a Tab stop.
 *
 * Every href comes from the S01 helpers, so the category link and the Discover
 * chips can never disagree about how a category is addressed.
 */
export function DetailBreadcrumb({ name, categoryName, categorySlug }: DetailBreadcrumbProps) {
  return (
    <nav className="product-detail__breadcrumb" aria-label={PRODUCT_DETAIL_COPY.breadcrumbLabel}>
      <Link className="product-detail__back-link" href={DISCOVER_ROUTE}>
        {PRODUCT_DETAIL_COPY.backToDiscover}
      </Link>
      <ol className="product-detail__crumbs">
        <li className="product-detail__crumb">
          <Link href={DISCOVER_ROUTE}>{PRODUCT_DETAIL_COPY.discover}</Link>
        </li>
        <li className="product-detail__crumb">
          <Link href={buildDiscoverHref(categorySlug)}>{categoryName}</Link>
        </li>
        <li className="product-detail__crumb" aria-current="page">
          {name}
        </li>
      </ol>
    </nav>
  );
}
