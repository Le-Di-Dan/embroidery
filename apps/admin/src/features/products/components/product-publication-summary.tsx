import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { formatPriceAmount, isPriceUnset } from '../model/product-price';
import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import { ProductMediaPlaceholder } from './product-media-placeholder';

interface ProductPublicationSummaryProps {
  readonly product: AdminProductDetailResponse;
}

/**
 * What will be publicly visible (`441:205` — Card / Nội dung sẽ hiển thị công
 * khai).
 *
 * Two honesty rules govern this card, and both come from the approved handoff
 * rather than from caution on my part.
 *
 * *The slug is metadata, not an address.* The mock renders
 * `/san-pham/khan-tay-theu-sen-do`, but the same handoff annotation marks that
 * pattern `CHƯA CHỐT` — only the API path is locked, the page path is not, and
 * it needs Product Owner confirmation before `APP2-S02`. So the bare
 * server-owned slug is shown as read-only text. Nothing here builds a URL,
 * links anywhere, or implies a page exists.
 *
 * *Media tiles are placeholders.* There is still no media-delivery contract
 * ("Chưa có hợp đồng phân phối media: ô ảnh giữ khối dự phòng, không tạo URL
 * ảnh máy chủ giả"), so these are the same neutral blocks the A03 form uses —
 * never an `<img>`, never a URL derived from an asset id, never a blob request.
 *
 * Ordering is the server's, and the first tile is marked `Ảnh đại diện` because
 * position — not a separate flag — is what makes an image the primary one.
 */
export function ProductPublicationSummary({ product }: ProductPublicationSummaryProps) {
  // The `"0"` sentinel means "no price decided yet", which the publication
  // screen states in its own words rather than borrowing the form's neutral
  // metadata copy.
  const price = isPriceUnset(product.basePriceAmount)
    ? PRODUCT_PUBLICATION_COPY.screen.noPrice
    : formatPriceAmount(product.basePriceAmount);

  return (
    <section className="product-publication__card" aria-labelledby="publication-summary-heading">
      <h2 className="product-publication__card-title" id="publication-summary-heading">
        {PRODUCT_PUBLICATION_COPY.screen.summaryHeading}
      </h2>

      <div
        className="product-publication__media"
        aria-label={PRODUCT_PUBLICATION_COPY.screen.mediaHeading}
      >
        {product.media.length === 0 ? (
          <p className="product-publication__empty">{PRODUCT_PUBLICATION_COPY.screen.noMedia}</p>
        ) : (
          product.media.map((item, index) => (
            <div
              key={item.assetId}
              className={
                index === 0
                  ? 'product-publication__media-tile product-publication__media-tile--primary'
                  : 'product-publication__media-tile'
              }
              data-testid="publication-media-tile"
            >
              <ProductMediaPlaceholder />
              {index === 0 ? (
                <span className="product-publication__media-badge">
                  {PRODUCT_PUBLICATION_COPY.screen.primaryMedia}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      <dl className="product-publication__fields">
        <div className="product-publication__field">
          <dt>{PRODUCT_PUBLICATION_COPY.screen.categoryLabel}</dt>
          {/* Authoritative category name from the record — never the mock's
              sample value, which belongs to a category this product may not be
              in. */}
          <dd>{product.category.name}</dd>
        </div>
        <div className="product-publication__field">
          <dt>{PRODUCT_PUBLICATION_COPY.screen.priceLabel}</dt>
          <dd>{price}</dd>
        </div>
        <div className="product-publication__field">
          <dt>{PRODUCT_PUBLICATION_COPY.screen.descriptionLabel}</dt>
          <dd>{product.description ?? PRODUCT_PUBLICATION_COPY.screen.noDescription}</dd>
        </div>
        <div className="product-publication__field">
          <dt>{PRODUCT_PUBLICATION_COPY.screen.slugLabel}</dt>
          <dd>
            <span className="product-publication__slug" data-testid="publication-slug">
              {product.slug}
            </span>
            <span className="product-publication__hint">
              {PRODUCT_PUBLICATION_COPY.screen.slugNote}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
