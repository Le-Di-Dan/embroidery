import Link from 'next/link';

import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { PRODUCT_COPY } from '../model/product-copy';
import { adminProductDetailRoute } from '../model/product-route';
import { ProductMediaPlaceholder } from './product-media-placeholder';
import { ProductStatusBadge } from './product-status-badge';

interface ProductTableProps {
  readonly items: readonly AdminProductSummaryResponse[];
}

/**
 * The desktop presentation (`439:100`): a real `<table>` with three columns —
 * Sản phẩm, Danh mục, Trạng thái.
 *
 * Semantic markup, not a grid of `<div>`s: the approved layout *is* a table, so
 * a screen reader should be able to navigate it as one.
 *
 * The row carries one explicit `Chỉnh sửa` link, not a whole-row navigation:
 * a row that is entirely clickable gives no hint about where it goes and makes
 * the name unselectable. The accessible name includes the product, so the links
 * are distinguishable when a screen reader lists them out of context.
 *
 * The stylesheet hides this element below the shell breakpoint, where
 * `ProductCardList` presents the same data. `display: none` removes a subtree
 * from the accessibility tree entirely, so exactly one of the two is ever
 * announced.
 */
export function ProductTable({ items }: ProductTableProps) {
  return (
    <table className="product-table">
      <caption className="product-table__caption">{PRODUCT_COPY.page.tableLabel}</caption>
      <thead>
        <tr>
          <th scope="col">{PRODUCT_COPY.columns.product}</th>
          <th scope="col">{PRODUCT_COPY.columns.category}</th>
          <th scope="col">{PRODUCT_COPY.columns.status}</th>
          <th scope="col">{PRODUCT_COPY.actions.columnLabel}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((product) => (
          <tr key={product.productId}>
            <th scope="row" className="product-table__product">
              {/*
                The cell keeps `display: table-cell` so the column tracks stay
                aligned; the flex layout lives on this wrapper instead.
              */}
              <span className="product-table__product-cell">
                <ProductMediaPlaceholder />
                <span className="product-table__name">{product.name}</span>
              </span>
            </th>
            <td className="product-table__category">{product.category.name}</td>
            <td className="product-table__status">
              <ProductStatusBadge status={product.status} />
            </td>
            <td className="product-table__actions">
              <Link
                className="product-table__edit"
                href={adminProductDetailRoute(product.productId)}
                aria-label={`${PRODUCT_COPY.actions.edit}: ${product.name}`}
              >
                {PRODUCT_COPY.actions.edit}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
