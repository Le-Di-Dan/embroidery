'use client';

import Link from 'next/link';

import { useQueryClient } from '@tanstack/react-query';

import { AdminProductDetailResponseStatus } from '@embroidery/api-client';

import {
  ProductSellabilitySection,
  StructuralUnsellabilityWarning,
} from '../../product-sellability';
import { isNotFound } from '../model/product-conflict';
import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { productQueryKeys } from '../model/product-query-keys';
import { ADMIN_PRODUCTS_ROUTE, adminProductPublicationRoute } from '../model/product-route';
import { parseProductStatus } from '../model/product-status';
import { useProductDetailQuery } from '../hooks/use-product-detail-query';
import { ProductEditForm } from './product-edit-form';
import { ProductPlacementEntry } from './product-placement-entry';
import { ProductPublicationEntry } from './product-publication-entry';
import { ProductPublishedMediaForm } from './product-published-media-form';

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
 * A PUBLISHED product renders `ProductPublishedMediaForm`: `APP12-M01.B2`
 * gives it exactly one write — the ordered image selection — so the screen that
 * used to refuse it entirely now offers that and only that. An ARCHIVED product
 * still renders read-only rather than 404: it exists, the operator may
 * legitimately have followed a link to it, and no contract lets this screen
 * change it.
 *
 * The form is keyed on `updatedAt` so a reload after a conflict remounts it
 * against the new record. Without the key, the seed the diff is computed from
 * would still be the stale one, and the very next save would re-send the token
 * that just failed.
 */
export function ProductDetailScreen({ productId }: ProductDetailScreenProps) {
  const query = useProductDetailQuery(productId);
  const queryClient = useQueryClient();

  /**
   * The sellability section changes what the next readiness report will say and
   * nothing that can be derived from its own response, so the report is
   * invalidated rather than patched.
   *
   * It is invalidated *here* rather than inside the sellability feature: the
   * readiness entry belongs to this capability's key factory, and a feature
   * that reached across to invalidate it by name would couple the two through a
   * string that nothing would check when the key changed shape.
   */
  const onStructureChanged = () => {
    void queryClient.invalidateQueries({
      queryKey: productQueryKeys.publicationReadiness(productId),
    });
  };

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

  if (product.status === AdminProductDetailResponseStatus.PUBLISHED) {
    return (
      <>
        {/*
          Publication and placement stay reachable beside the media editor.
          Unpublishing is a lifecycle decision the operator may still want, and
          curating images is explicitly not one — nothing on the media form
          touches the status.
        */}
        <div className="product-form__publication-entry">
          <ProductPublicationEntry
            productId={product.productId}
            status={parseProductStatus(product.status)}
          />
          <ProductPlacementEntry productId={product.productId} />
        </div>
        {/*
          Above the form on purpose. A published product that cannot be ordered
          looks healthy everywhere else in the Admin, so the one screen that can
          say otherwise says it before the operator starts editing images.
        */}
        <StructuralUnsellabilityWarning
          productId={product.productId}
          status={product.status}
          readinessHref={adminProductPublicationRoute(product.productId)}
        />
        <ProductPublishedMediaForm
          key={product.updatedAt}
          product={product}
          onReload={() => {
            void query.refetch();
          }}
        />
        {/*
          Editable while published, and it unlocks nothing else: name,
          description, category and base price stay behind the read-only lock
          above, and `M01`'s media curation is untouched. A live product with no
          orderable variant has to be repairable in place — an
          unpublish → edit → republish cycle would take a working storefront
          page down to fix something the customer cannot see (`973:187`).
        */}
        <ProductSellabilitySection
          productId={product.productId}
          status={product.status}
          basePriceAmount={product.basePriceAmount}
          onStructureChanged={onStructureChanged}
        />
      </>
    );
  }

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
            ARCHIVED is what reaches this branch now, and its publication entry
            renders nothing — there is no transition out of it this screen owns
            (`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`).
          */}
          <ProductPublicationEntry
            productId={product.productId}
            status={parseProductStatus(product.status)}
          />
          {/*
            Placement stays reachable for a non-DRAFT product. Sides and areas
            exist independently of public visibility, and a PUBLISHED product
            whose placement needs a correction is exactly the case that must not
            be locked out (`APP3-A01`).
          */}
          <ProductPlacementEntry productId={product.productId} />
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
        <ProductPlacementEntry productId={product.productId} />
      </div>
      <ProductEditForm
        key={product.updatedAt}
        product={product}
        onReload={() => {
          void query.refetch();
        }}
      />
      {/*
        After pricing and immediately before the publication handoff, as the
        approved information architecture places it (`971:187`, `972:187`). It
        sits outside the form because its writes are their own operations: a
        variant commits when its dialog is confirmed, and the form's save button
        never touches one.
      */}
      <ProductSellabilitySection
        productId={product.productId}
        status={product.status}
        basePriceAmount={product.basePriceAmount}
        onStructureChanged={onStructureChanged}
      />
    </>
  );
}
