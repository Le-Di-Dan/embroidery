'use client';

import Link from 'next/link';

import { PRODUCT_COPY } from '../model/product-copy';
import { ADMIN_PRODUCT_NEW_ROUTE } from '../model/product-route';
import { useCategoryInventoryQuery } from '../hooks/use-category-inventory-query';
import { useProductFilters } from '../hooks/use-product-filters';
import { ProductCollection } from './product-collection';
import { ProductFilterBar } from './product-filter-bar';

/**
 * The Admin product list capability (`FIG-ADMIN-CATALOG-*`, approved under
 * `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`).
 *
 * `APP2-A03` has restored exactly two entry points: `Tạo sản phẩm` and the
 * per-row `Chỉnh sửa`. Publication, archive and delete are still absent — the
 * capabilities behind them belong to `APP2-B03`/`APP2-A04` and to an
 * undecided archive surface, and a control for something that does not exist
 * yet is a dead end for the operator.
 *
 * Composition only. The filter state lives in the URL (`useProductFilters`) and
 * the collection owns its own query, so this component holds no data and no
 * derived list state.
 */
export function ProductListScreen() {
  const { filters, setStatus, setCategory } = useProductFilters();
  // The filter chips are the categories the database currently publishes
  // (`APP12-C01-C1`). While the read is in flight — or if it fails — the bar
  // offers "all" alone rather than a remembered list.
  const categories = useCategoryInventoryQuery();

  return (
    <section className="products">
      <header className="products__header">
        <div className="products__heading">
          <h1 className="products__title">{PRODUCT_COPY.page.title}</h1>
          <Link className="products__create" href={ADMIN_PRODUCT_NEW_ROUTE}>
            {PRODUCT_COPY.actions.create}
          </Link>
        </div>
        {/*
          The approved frames carry different subtitles at 1440 and 390. Exactly
          one is ever rendered: the stylesheet hides the other with
          `display: none`, which removes it from the accessibility tree too.
        */}
        <p className="products__subtitle products__subtitle--wide">
          {PRODUCT_COPY.page.subtitleWide}
        </p>
        <p className="products__subtitle products__subtitle--narrow">
          {PRODUCT_COPY.page.subtitleNarrow}
        </p>
      </header>

      <ProductFilterBar
        filters={filters}
        onStatusChange={setStatus}
        onCategoryChange={setCategory}
        categories={categories.data ?? []}
      />
      <ProductCollection filters={filters} />
    </section>
  );
}
