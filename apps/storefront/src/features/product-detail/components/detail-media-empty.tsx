import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

/**
 * `media = []` — the artwork has no published image yet (`532:3`).
 *
 * Says so, and stops. No placeholder illustration, no "coming soon" promise and
 * deliberately no zoom hint, thumbnail strip or lightbox trigger: every one of
 * those would advertise something that does not exist. The Product's name,
 * category, description and Share stay exactly where they were, so the page is
 * still worth reading.
 */
export function DetailMediaEmpty() {
  return (
    <section className="product-detail__gallery" aria-label={PRODUCT_DETAIL_COPY.galleryLabel}>
      <div className="product-detail__stage product-detail__stage--empty">
        <p className="product-detail__stage-message">{PRODUCT_DETAIL_COPY.mediaEmpty}</p>
      </div>
    </section>
  );
}
