import Link from 'next/link';

import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { PRODUCT_COPY } from '../model/product-copy';
import { adminProductDetailRoute } from '../model/product-route';
import { ProductMediaPlaceholder } from './product-media-placeholder';
import { ProductStatusBadge } from './product-status-badge';

interface ProductCardListProps {
  readonly items: readonly AdminProductSummaryResponse[];
}

/**
 * The mobile presentation (`440:191`): a single-column list of informational
 * cards carrying the same three facts as the desktop table.
 *
 * One explicit `Chỉnh sửa` action per card, sized for touch — not a tappable
 * card surface, which would swallow text selection and give no target hint. The
 * stylesheet hides this element at and above the shell breakpoint, where
 * `ProductTable` presents the same data.
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
              <p className="product-card__category">{product.category.name}</p>
            </div>
          </div>
          <div className="product-card__bottom">
            <ProductStatusBadge status={product.status} />
            <Link
              className="product-card__edit"
              href={adminProductDetailRoute(product.productId)}
              aria-label={`${PRODUCT_COPY.actions.edit}: ${product.name}`}
            >
              {PRODUCT_COPY.actions.edit}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
