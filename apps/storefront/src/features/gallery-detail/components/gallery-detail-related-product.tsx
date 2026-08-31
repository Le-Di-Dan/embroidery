'use client';

import Link from 'next/link';
import { useState } from 'react';

import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import type { GalleryDetailLinkedProduct } from '../model/gallery-detail-view';
import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * The optional Related Product affordance
 * (`Section / Related Product (optional linked_product_id)`).
 *
 * **The caller renders nothing at all when `linkedProduct` is null**, and that
 * is the whole privacy property. `APP11-B03` returns null both when no product
 * was ever linked and when the linked product is draft, archived or otherwise
 * non-public — the two are indistinguishable in the contract, so the page must
 * not distinguish them either. A "product unavailable" placeholder, a greyed
 * card or an empty heading would each announce that *something* is there,
 * which is exactly the fact the API refuses to disclose.
 *
 * When it is non-null the product is already publicly visible, so linking to
 * `/san-pham/[slug]` through the shell's canonical builder cannot lead to a
 * 404 that the gallery caused.
 *
 * This is a studio cross-reference, not a shop listing: no price, no stock, no
 * cart, no buy, no product id and no lifecycle state. The projection carries
 * none of them, so none can be rendered by accident.
 *
 * The thumbnail is optional and, when absent, is simply not drawn — an address
 * composed from a product id would 404 at the catalog media route. The
 * client-side failure swap covers the other case: the product can be
 * unpublished while a visitor is reading, at which point the publication-gated
 * media route legitimately stops serving those bytes. The card degrades to its
 * text and stays a working link; there is deliberately no retry, because the
 * route answering 404 is the correct answer.
 */
export function GalleryDetailRelatedProduct({ product }: { product: GalleryDetailLinkedProduct }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const showThumbnail = product.thumbnailUrl !== undefined && !thumbnailFailed;

  return (
    <section className="gallery-detail__related" aria-labelledby="gallery-detail-related-heading">
      <h2 className="gallery-detail__related-heading" id="gallery-detail-related-heading">
        {GALLERY_DETAIL_COPY.relatedProductHeading}
      </h2>
      <Link
        className="gallery-detail__related-card"
        href={buildStorefrontProductDetailPath(product.slug)}
      >
        {showThumbnail ? (
          <span className="gallery-detail__related-media">
            {/* Decorative: the link's own text already names the product, so an
                alt here would announce the same name twice. A plain <img> for
                the reason the stage gives — no intrinsic dimensions are
                published by the catalog contract either.
                eslint-disable-next-line @next/next/no-img-element */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="gallery-detail__related-image"
              src={product.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setThumbnailFailed(true)}
            />
          </span>
        ) : null}
        <span className="gallery-detail__related-text">
          <span className="gallery-detail__related-name">{product.name}</span>
          <span className="gallery-detail__related-action">
            {GALLERY_DETAIL_COPY.relatedProductAction}
          </span>
        </span>
      </Link>
    </section>
  );
}
