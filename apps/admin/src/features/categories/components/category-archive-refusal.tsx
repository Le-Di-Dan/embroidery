'use client';

import Link from 'next/link';

import { AdminProductListStatus } from '@embroidery/api-client';

import { ADMIN_PRODUCTS_ROUTE, toFilterSearchString } from '../../products';
import { CATEGORY_COPY } from '../model/category-copy';

interface CategoryArchiveRefusalProps {
  /** The server's current count, re-read after the refusal. */
  readonly publishedProductCount: number;
  readonly categorySlug: string;
}

/**
 * The archive refusal (`916:393` — `BR-036`).
 *
 * ## It names the number and the next action
 *
 * The frame is explicit that a refusal states the count and what to do about
 * it, not merely that the archive was refused. So this renders three things:
 * the refusal, the current blocking count, and a link to exactly the products
 * that are blocking it — published, in this category. "Không được" with no
 * count and no destination leaves the operator to guess which products they
 * own.
 *
 * ## The count is the server's, and it is re-read
 *
 * `CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS` is decided inside the
 * archive transaction against a locked row, so the number the screen was
 * holding when the operator pressed the button may already be out of date —
 * that is precisely why the attempt failed. The transition hook invalidates the
 * inventory on failure, so the value passed here is from the refetched list.
 * This component displays; it never counts.
 *
 * ## Nothing is done to the products
 *
 * There is no bulk unpublish, no reassign, and no move to a fallback category —
 * there is no fallback category. The operator is taken to the products and
 * makes the decision themselves, one product at a time, through the contract
 * that owns product publication.
 */
export function CategoryArchiveRefusal({
  publishedProductCount,
  categorySlug,
}: CategoryArchiveRefusalProps) {
  const href = `${ADMIN_PRODUCTS_ROUTE}?${toFilterSearchString({
    status: AdminProductListStatus.PUBLISHED,
    category: categorySlug,
  })}`;

  return (
    <div className="category-refusal" role="alert" data-testid="category-archive-refusal">
      <p className="category-refusal__title">
        <span className="category-refusal__symbol" aria-hidden="true">
          {CATEGORY_COPY.archiveRefusal.symbol}
        </span>
        {CATEGORY_COPY.archiveRefusal.title}
      </p>
      <p className="category-refusal__body">
        {CATEGORY_COPY.archiveRefusal.body(publishedProductCount)}
      </p>
      <Link className="category-refusal__action" href={href}>
        {CATEGORY_COPY.archiveRefusal.action(publishedProductCount)}
      </Link>
    </div>
  );
}
