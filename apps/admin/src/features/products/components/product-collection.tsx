'use client';

import { useEffect, useRef, useState } from 'react';

import { PRODUCT_COPY } from '../model/product-copy';
import { flattenProductPages } from '../model/product-pages';
import { isAnyFilterActive, type ProductFilters } from '../model/product-filters';
import { useProductListQuery } from '../hooks/use-product-list-query';
import { ProductCardList } from './product-card-list';
import { ProductContinuation } from './product-continuation';
import { ProductTable } from './product-table';

interface ProductCollectionProps {
  readonly filters: ProductFilters;
}

/**
 * The product collection and every data-derived state around it.
 *
 * The four presentations are mutually exclusive and derived from the query, not
 * from a local flag: loading, first-page failure, empty and populated. Empty is
 * shown only when the server actually answered with no items — never while
 * loading and never after a failure, both of which would claim the operator has
 * no products when nothing is known.
 *
 * Which empty state applies is decided by the filters, not by the response: a
 * narrowed list that found nothing says so and suggests widening it, while an
 * unfiltered catalogue that is genuinely empty says the drafts have not been
 * created yet. Getting this backwards would send the operator looking for a
 * filter they never set.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the collection.
 */
export function ProductCollection({ filters }: ProductCollectionProps) {
  const query = useProductListQuery(filters);
  const pages = query.data?.pages ?? [];
  const items = flattenProductPages(pages);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(PRODUCT_COPY.continuation.loaded);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return (
      <p className="products__list-status" role="status">
        {PRODUCT_COPY.list.loading}
      </p>
    );
  }

  if (query.isError && loadedPageCount === 0) {
    return (
      <div className="products__list-unavailable" role="alert">
        <p className="products__list-unavailable-title">{PRODUCT_COPY.list.unavailableTitle}</p>
        <p className="products__list-unavailable-body">
          {PRODUCT_COPY.list.unavailableDescription}
        </p>
        <button
          type="button"
          className="products__list-unavailable-action"
          onClick={() => {
            void query.refetch();
          }}
        >
          {PRODUCT_COPY.list.unavailableRetry}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    const filtered = isAnyFilterActive(filters);
    return (
      <div className="products__empty">
        <p className="products__empty-title">
          {filtered ? PRODUCT_COPY.list.filteredEmptyTitle : PRODUCT_COPY.list.emptyTitle}
        </p>
        <p className="products__empty-body">
          {filtered
            ? PRODUCT_COPY.list.filteredEmptyDescription
            : PRODUCT_COPY.list.emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <>
      <ProductTable items={items} />
      <ProductCardList items={items} />
      <p className="products__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      <ProductContinuation
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </>
  );
}
