'use client';

import { PRODUCT_COPY } from '../model/product-copy';
import {
  PRODUCT_CATEGORY_FILTER_OPTIONS,
  PRODUCT_STATUS_FILTER_OPTIONS,
  type ProductCategoryFilter,
  type ProductFilters,
  type ProductStatusFilter,
} from '../model/product-filters';

interface ProductFilterBarProps {
  readonly filters: ProductFilters;
  readonly onStatusChange: (status: ProductStatusFilter) => void;
  readonly onCategoryChange: (category: ProductCategoryFilter) => void;
}

/**
 * The two approved filters (`493:273` desktop, `495:273` mobile): status first,
 * category second, each with a permanently visible label above a 48px control.
 *
 * Native `<select>` on purpose. It is keyboard- and screen-reader-correct
 * without a single line of interaction code, it uses the platform picker on a
 * touch device, and the approved field is a labelled select with a chevron —
 * not a custom listbox. No unlabelled icon buttons, and no "clear all" control:
 * the design defines neither.
 *
 * The controls stay mounted and enabled while a page is loading, so the
 * operator can always see and change what they asked for.
 */
export function ProductFilterBar({
  filters,
  onStatusChange,
  onCategoryChange,
}: ProductFilterBarProps) {
  return (
    <div className="product-filters">
      <div className="product-filter">
        <label className="product-filter__label" htmlFor="product-filter-status">
          {PRODUCT_COPY.filters.statusLabel}
        </label>
        <select
          id="product-filter-status"
          className="product-filter__control"
          value={filters.status}
          onChange={(event) => onStatusChange(event.target.value as ProductStatusFilter)}
        >
          {PRODUCT_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="product-filter">
        <label className="product-filter__label" htmlFor="product-filter-category">
          {PRODUCT_COPY.filters.categoryLabel}
        </label>
        <select
          id="product-filter-category"
          className="product-filter__control"
          value={filters.category}
          onChange={(event) => onCategoryChange(event.target.value as ProductCategoryFilter)}
        >
          {PRODUCT_CATEGORY_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
