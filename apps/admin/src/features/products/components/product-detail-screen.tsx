'use client';

import Link from 'next/link';

import { AdminProductDetailResponseStatus } from '@embroidery/api-client';

import { isNotFound } from '../model/product-conflict';
import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { ADMIN_PRODUCTS_ROUTE } from '../model/product-route';
import { parseProductStatus } from '../model/product-status';
import { useProductDetailQuery } from '../hooks/use-product-detail-query';
import { ProductEditForm } from './product-edit-form';
import { ProductPublicationEntry } from './product-publication-entry';

interface ProductDetailScreenProps {
  readonly productId: string;
}

/**
 * `/products/[productId]` — the load boundary for edit/detail.
 *
 * The five required states are derived from the query and the authoritative
 * status, never from a local flag: loading, not found, not editable, unavailable
 * and the editable draft. "Not found" is distinguished from a generic failure
 * because the two need different actions — one is a dead link, the other is
 * worth retrying.
 *
 * A non-DRAFT product renders read-only rather than 404: it exists, the
 * operator may legitimately have followed a link to it, and `APP2-A03` simply
 * does not own editing a published or archived record.
 *
 * The form is keyed on `updatedAt` so a reload after a conflict remounts it
 * against the new record. Without the key, the seed the diff is computed from
 * would still be the stale one, and the very next save would re-send the token
 * that just failed.
 */
export function ProductDetailScreen({ productId }: ProductDetailScreenProps) {
  const query = useProductDetailQuery(productId);

  if (query.isPending) {
    return (
      <section className="product-form">
        <p className="product-form__status" role="status">
          {PRODUCT_FORM_COPY.detail.loading}
        </p>
      </section>
    );
  }

  if (query.isError) {
    const notFound = isNotFound(query.error);
    return (
      <section className="product-form">
        <div className="product-form__failure" role="alert">
          <p className="product-form__failure-title">
            {notFound
              ? PRODUCT_FORM_COPY.detail.notFoundTitle
              : PRODUCT_FORM_COPY.detail.unavailableTitle}
          </p>
          <p className="product-form__failure-body">
            {notFound
              ? PRODUCT_FORM_COPY.detail.notFoundBody
              : PRODUCT_FORM_COPY.detail.unavailableBody}
          </p>
          {notFound ? (
            <Link className="product-form__secondary" href={ADMIN_PRODUCTS_ROUTE}>
              {PRODUCT_FORM_COPY.detail.backToList}
            </Link>
          ) : (
            <button
              type="button"
              className="product-form__secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              {PRODUCT_FORM_COPY.detail.retry}
            </button>
          )}
        </div>
      </section>
    );
  }

  const product = query.data;

  if (product.status !== AdminProductDetailResponseStatus.DRAFT) {
    return (
      <section className="product-form">
        <div className="product-form__failure" role="alert">
          <p className="product-form__failure-title">{PRODUCT_FORM_COPY.detail.notEditableTitle}</p>
          <p className="product-form__failure-body">{PRODUCT_FORM_COPY.detail.notEditableBody}</p>
          <Link className="product-form__secondary" href={ADMIN_PRODUCTS_ROUTE}>
            {PRODUCT_FORM_COPY.detail.backToList}
          </Link>
          {/*
            A PUBLISHED product is not editable here, but its publication is
            still manageable — that is the one action this screen can honestly
            offer for it. ARCHIVED renders nothing.
          */}
          <ProductPublicationEntry
            productId={product.productId}
            status={parseProductStatus(product.status)}
          />
        </div>
      </section>
    );
  }

  return (
    <>
      {/*
        The DRAFT entry point. It sits outside the form so the form keeps
        ownership of its own dirty state, and it routes its departure through
        the shared navigation guard so unsaved edits are still protected.
      */}
      <div className="product-form__publication-entry">
        <ProductPublicationEntry productId={product.productId} status="DRAFT" />
      </div>
      <ProductEditForm
        key={product.updatedAt}
        product={product}
        onReload={() => {
          void query.refetch();
        }}
      />
    </>
  );
}
