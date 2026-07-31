import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { PRODUCT_COPY } from '../model/product-copy';
import { parseProductCategory, productCategoryLabel } from '../model/product-category';
import { ProductMediaPlaceholder } from './product-media-placeholder';
import { ProductStatusBadge } from './product-status-badge';

interface ProductCardListProps {
  readonly items: readonly AdminProductSummaryResponse[];
}

/**
 * The mobile presentation (`440:191`): a single-column list of informational
 * cards carrying the same three facts as the desktop table.
 *
 * Informational, not interactive — no card link, no action menu, no overflow
 * button. The stylesheet hides this element at and above the shell breakpoint,
 * where `ProductTable` presents the same data.
 */
export function ProductCardList({ items }: ProductCardListProps) {
  return (
    <ul className="product-card-list" aria-label={PRODUCT_COPY.page.collectionLabel}>
      {items.map((product) => (
        <li key={product.productId} className="product-card">
          <div className="product-card__top">
            <ProductMediaPlaceholder />
            <div className="product-card__info">
              <p className="product-card__name">{product.name}</p>
              <p className="product-card__category">
                {productCategoryLabel(parseProductCategory(product.category.slug))}
              </p>
            </div>
          </div>
          <div className="product-card__bottom">
            <ProductStatusBadge status={product.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
