'use client';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { ProductStatusBadge } from './product-status-badge';

interface ProductMetadataRailProps {
  readonly product: AdminProductDetailResponse;
  /**
   * What the status card says about visibility.
   *
   * The draft sentence — "Bản nháp không hiển thị với khách truy cập" — is
   * false of a PUBLISHED product, which `APP12-M01.A1` now renders here too. It
   * is passed in rather than derived from `product.status` so this component
   * keeps rendering what it is told and owns no lifecycle vocabulary of its own.
   */
  readonly statusNote?: string;
}

/**
 * The read-only rail (`434:20` — Metadata rail).
 *
 * Everything here is server-owned and stays that way. The slug is rendered as
 * text, never as an input: it is derived from the name at creation and is
 * immutable in `APP2-B02`, so an editable-looking control would promise a
 * rename the contract cannot perform. The note states that explicitly, because
 * the natural assumption is that renaming a product moves its public address.
 *
 * Status is a badge with a text label, not a select. `APP2-A03` changes no
 * lifecycle state — publish, unpublish, archive and delete all belong to later
 * checkpoints — so there is nothing here to choose between.
 *
 * The category UUID is not in the contract and is never rendered; the rail
 * shows no storage key, checksum or worker detail either.
 */
export function ProductMetadataRail({ product, statusNote }: ProductMetadataRailProps) {
  return (
    <aside className="product-rail">
      <section className="product-rail__card">
        <h2 className="product-rail__title">{PRODUCT_FORM_COPY.status.cardTitle}</h2>
        <ProductStatusBadge status={product.status} />
        <p className="product-rail__note">{statusNote ?? PRODUCT_FORM_COPY.status.draftNote}</p>
      </section>

      <section className="product-rail__card">
        <h2 className="product-rail__title">{PRODUCT_FORM_COPY.slug.cardTitle}</h2>
        <p className="product-rail__value">{product.slug}</p>
        <p className="product-rail__note">{PRODUCT_FORM_COPY.slug.note}</p>
      </section>
    </aside>
  );
}
