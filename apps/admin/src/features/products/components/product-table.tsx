import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { PRODUCT_COPY } from '../model/product-copy';
import { parseProductCategory, productCategoryLabel } from '../model/product-category';
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
 * a screen reader should be able to navigate it as one. There is no action
 * column and no row link — `APP2-A02` is read-only, and `APP2-A03` owns the
 * detail route that does not exist yet.
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
            <td className="product-table__category">
              {productCategoryLabel(parseProductCategory(product.category.slug))}
            </td>
            <td className="product-table__status">
              <ProductStatusBadge status={product.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
