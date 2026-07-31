'use client';

import { PRODUCT_COPY } from '../model/product-copy';
import { useProductFilters } from '../hooks/use-product-filters';
import { ProductCollection } from './product-collection';
import { ProductFilterBar } from './product-filter-bar';

/**
 * The Admin product list capability (`FIG-ADMIN-CATALOG-*`, approved under
 * `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`).
 *
 * Read-only by design, not by omission: there is no create button, no row
 * action, no publication control and no archive. `APP2-A03` restores create and
 * edit, `APP2-A04` adds publication — and neither may be hinted at here, since
 * a control for a capability that does not exist yet is a dead end for the
 * operator.
 *
 * Composition only. The filter state lives in the URL (`useProductFilters`) and
 * the collection owns its own query, so this component holds no data and no
 * derived list state.
 */
export function ProductListScreen() {
  const { filters, setStatus, setCategory } = useProductFilters();

  return (
    <section className="products">
      <header className="products__header">
        <h1 className="products__title">{PRODUCT_COPY.page.title}</h1>
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
      />
      <ProductCollection filters={filters} />
    </section>
  );
}
