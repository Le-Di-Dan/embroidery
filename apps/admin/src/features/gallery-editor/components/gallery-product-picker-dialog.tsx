'use client';

import { useMemo } from 'react';

import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { flattenProductPages, useLinkableProductQuery } from '../hooks/use-gallery-linked-product';
import { GalleryDialog } from './gallery-dialog';

interface GalleryProductPickerDialogProps {
  readonly selectedProductId: string;
  readonly onClose: () => void;
  readonly onSelect: (productId: string) => void;
}

/**
 * The linked-product picker.
 *
 * Reuses the existing Admin product read; no second product API and no product
 * write is reachable from here. The list is deliberately **not** filtered to
 * published products: the gallery contract validates a linked product as
 * Admin-visible rather than publicly visible, so refusing to offer a draft
 * would be this screen enforcing a rule the server does not have — and an
 * operator preparing a gallery entry alongside an unreleased product is the
 * ordinary case.
 *
 * Every option is named by the product's **name**. The UUID appears only as a
 * React key and as the value that is stored; it is never the label, because an
 * internal identifier presented to an operator is not information.
 *
 * Choosing applies immediately and closes: the field below it is what holds the
 * pending change, and the authoring save is what persists it.
 */
export function GalleryProductPickerDialog({
  selectedProductId,
  onClose,
  onSelect,
}: GalleryProductPickerDialogProps) {
  const query = useLinkableProductQuery(true);
  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const products = useMemo(() => flattenProductPages(pages), [pages]);

  const copy = GALLERY_EDITOR_COPY.linkedProduct.picker;
  const loadedPages = pages.length;
  const firstPageFailed = query.isError && loadedPages === 0;

  return (
    <GalleryDialog
      title={copy.title}
      describedBy="gallery-product-picker-help"
      onClose={onClose}
      testId="gallery-product-picker"
      footer={
        <div className="gallery-dialog__actions">
          <button type="button" className="gallery-dialog__secondary" onClick={onClose}>
            {copy.cancel}
          </button>
        </div>
      }
    >
      <p className="gallery-picker__help" id="gallery-product-picker-help">
        {copy.help}
      </p>

      {query.isPending ? (
        <p className="gallery-picker__status" role="status">
          {copy.loading}
        </p>
      ) : null}

      {firstPageFailed ? (
        <div className="gallery-editor__failure" role="alert">
          <p className="gallery-editor__failure-title">{copy.unavailableTitle}</p>
          <p className="gallery-editor__failure-body">{copy.unavailableBody}</p>
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}

      {!query.isPending && !firstPageFailed && products.length === 0 ? (
        <div className="gallery-picker__empty">
          <p className="gallery-picker__empty-title">{copy.emptyTitle}</p>
          <p className="gallery-picker__empty-body">{copy.emptyBody}</p>
        </div>
      ) : null}

      {products.length > 0 ? (
        <ul className="gallery-product-picker__list">
          {products.map((product) => (
            <li key={product.productId} className="gallery-product-picker__option">
              <span className="gallery-product-picker__name">{product.name}</span>
              <button
                type="button"
                className="gallery-dialog__secondary"
                disabled={product.productId === selectedProductId}
                onClick={() => onSelect(product.productId)}
                aria-label={`${copy.select}: ${product.name}`}
              >
                {copy.select}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <div className="gallery-picker__continuation">
          {query.isError && loadedPages > 0 ? (
            <p className="gallery-picker__continuation-error" role="alert">
              {copy.loadMoreFailed}
            </p>
          ) : null}
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={() => {
              void query.fetchNextPage();
            }}
            disabled={query.isFetchingNextPage}
            aria-busy={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage
              ? copy.loadingMore
              : query.isError
                ? copy.retry
                : copy.loadMore}
          </button>
        </div>
      ) : null}
    </GalleryDialog>
  );
}
