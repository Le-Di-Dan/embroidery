'use client';

import { useId } from 'react';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import {
  ALL_FILTER_VALUE,
  TEMPLATE_STATUS_FILTER_OPTIONS,
  type DesignTemplateFilters,
  type TemplateProductFilter,
  type TemplateStatusFilter,
} from '../model/design-template-filters';
import type { TemplateProductOptions } from '../hooks/use-template-product-options';

interface DesignTemplateFilterBarProps {
  readonly filters: DesignTemplateFilters;
  readonly products: TemplateProductOptions;
  readonly onStatusChange: (status: TemplateStatusFilter) => void;
  readonly onProductChange: (productId: TemplateProductFilter) => void;
}

/**
 * The two approved filters (`596:8`).
 *
 * Both are real `APP3-B03` query parameters. What is absent is absent because
 * the contract has none of it: no search box, no sort selector, no page size
 * chooser. The constraint line says so on the toolbar rather than leaving the
 * operator hunting for a search field that was never built — an explanation is
 * cheaper than the support question.
 *
 * Native `<select>`s with real `<label for>`: they are keyboard- and
 * screen-reader-complete without a line of code, and this screen has no reason
 * to reimplement a listbox.
 */
export function DesignTemplateFilterBar({
  filters,
  products,
  onStatusChange,
  onProductChange,
}: DesignTemplateFilterBarProps) {
  const statusId = useId();
  const productId = useId();

  return (
    <section className="design-template-filters" aria-label={DESIGN_TEMPLATE_COPY.filters.label}>
      <div className="design-template-filters__field">
        <label className="design-template-filters__label" htmlFor={statusId}>
          {DESIGN_TEMPLATE_COPY.filters.statusLabel}
        </label>
        <select
          id={statusId}
          className="design-template-filters__control"
          value={filters.status}
          data-testid="template-status-filter"
          onChange={(event) => {
            onStatusChange(event.target.value as TemplateStatusFilter);
          }}
        >
          {TEMPLATE_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="design-template-filters__field">
        <label className="design-template-filters__label" htmlFor={productId}>
          {DESIGN_TEMPLATE_COPY.filters.productLabel}
        </label>
        <select
          id={productId}
          className="design-template-filters__control"
          value={filters.productId}
          data-testid="template-product-filter"
          onChange={(event) => {
            onProductChange(event.target.value);
          }}
        >
          <option value={ALL_FILTER_VALUE}>{DESIGN_TEMPLATE_COPY.filters.productAll}</option>
          {products.options.map((product) => (
            <option key={product.productId} value={product.productId}>
              {product.name}
            </option>
          ))}
        </select>
        {/*
          The filter is a convenience over a capability. If products cannot be
          listed the select still offers "all", and the reason is stated instead
          of the control silently appearing empty.
        */}
        {products.unavailable ? (
          <p className="design-template-filters__note" role="status">
            {DESIGN_TEMPLATE_COPY.filters.productUnavailable}
          </p>
        ) : null}
      </div>

      <p className="design-template-filters__constraint">
        {DESIGN_TEMPLATE_COPY.filters.constraint}
      </p>
    </section>
  );
}
