import Link from 'next/link';

import { DISCOVER_ROUTE } from '../../product-discovery';
import { resolveProductBreadcrumb } from '../model/product-breadcrumb';
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
 * page you are already on is a dead control that costs a Tab stop. That is now
 * expressed as "the resolved item carries no `path`" rather than as a hand-built
 * last `<li>`.
 *
 * ## Where the items come from (`APP11-S04-C1`)
 *
 * The trail is no longer assembled here. `resolveProductBreadcrumb` owns it, and
 * the `BreadcrumbList` JSON-LD the route segment emits reads the same function —
 * so what a visitor sees and what a crawler parses are one sequence rather than
 * two that happen to agree. They previously agreed on a category crumb linking
 * to `/kham-pha?category=<catalog slug>`, which Discover answers with its
 * not-found boundary whenever that slug is not one of its four filters; the
 * model drops the crumb in that case, so this component renders two levels
 * instead of three and never emits a dead href.
 *
 * The category link, when there is one, still goes through the S01 builder, so
 * the crumb and the Discover chips cannot disagree about how a category is
 * addressed.
 */
export function DetailBreadcrumb({ name, categoryName, categorySlug }: DetailBreadcrumbProps) {
  const items = resolveProductBreadcrumb({ name, categoryName, categorySlug });

  return (
    <nav className="product-detail__breadcrumb" aria-label={PRODUCT_DETAIL_COPY.breadcrumbLabel}>
      <Link className="product-detail__back-link" href={DISCOVER_ROUTE}>
        {PRODUCT_DETAIL_COPY.backToDiscover}
      </Link>
      <ol className="product-detail__crumbs">
        {items.map((item) =>
          item.path === undefined ? (
            <li className="product-detail__crumb" key={item.name} aria-current="page">
              {item.name}
            </li>
          ) : (
            <li className="product-detail__crumb" key={item.name}>
              <Link href={item.path}>{item.name}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
