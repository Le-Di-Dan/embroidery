import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

/**
 * The route's loading state.
 *
 * A neutral stage and one honest line. No skeleton title, no placeholder
 * thumbnails and no reserved image box of a guessed ratio: the contract
 * publishes no dimensions, so a skeleton shaped like an artwork would be a claim
 * about a Product nobody has loaded yet — and would jump the moment the real
 * image arrived at a different shape.
 */
export function DetailLoading() {
  return (
    <div className="product-detail product-detail--loading">
      <div className="product-detail__stage product-detail__stage--empty">
        <p className="product-detail__stage-message">{PRODUCT_DETAIL_COPY.loading}</p>
      </div>
    </div>
  );
}
