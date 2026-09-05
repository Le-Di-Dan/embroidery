'use client';

import { useEffect, useMemo, useState } from 'react';

import { AssetThumbnail } from '../../../shared/media/asset-thumbnail';
import { flattenSelectableAssets } from '../model/product-asset-eligibility';
import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { buildMediaMetaLine, resolveMediaTitle } from '../model/product-media-identity';
import { addToSelection, dedupe } from '../model/product-media-selection';
import { useSelectableAssetQuery } from '../hooks/use-selectable-asset-query';
import { ProductDialog } from './product-dialog';
import type { ProductMediaRowData } from './product-media-row';

interface ProductAssetPickerDialogProps {
  readonly selection: readonly string[];
  readonly onClose: () => void;
  readonly onConfirm: (selection: readonly string[]) => void;
  readonly onLearnMedia: (media: readonly ProductMediaRowData[]) => void;
}

/**
 * The media picker (`437:73`).
 *
 * Only accepted catalog media appears — the filter is applied to the response,
 * not assumed of it, so an asset still being inspected or already rejected is
 * never offered. Each tile shows the image itself through `adminAsset_preview`
 * (`APP12-V02-C2`); before that contract existed there was no address to load
 * one from, so every tile was a neutral block and an operator chose a product
 * image by its media type and file size.
 *
 * Continuation is explicit and cursor-based. "Tải thêm tài sản" appears only
 * while `hasNext` holds, a failed page leaves the loaded tiles on screen, and
 * the retry re-sends the identical cursor rather than restarting from page one.
 * There is no infinite scroll, no page number and no total — the contract
 * publishes none of them.
 *
 * Selection is staged locally and applied on confirm, so dismissing the dialog
 * leaves the product's media exactly as it was.
 */
export function ProductAssetPickerDialog({
  selection,
  onClose,
  onConfirm,
  onLearnMedia,
}: ProductAssetPickerDialogProps) {
  const [staged, setStaged] = useState<readonly string[]>(() => dedupe(selection));
  const query = useSelectableAssetQuery(true);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const assets = useMemo(() => flattenSelectableAssets(pages), [pages]);

  // Identity for anything the operator picks has to outlive the dialog, since
  // the rows below the form render from it after the dialog is gone.
  useEffect(() => {
    if (assets.length > 0) {
      onLearnMedia(
        assets.map((asset) => ({
          assetId: asset.assetId,
          mediaType: asset.mediaType,
          byteSize: asset.byteSize,
          createdAt: asset.createdAt,
        })),
      );
    }
  }, [assets, onLearnMedia]);

  const toggle = (assetId: string) => {
    setStaged((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : addToSelection(current, [assetId]),
    );
  };

  const loadedPages = pages.length;
  const firstPageFailed = query.isError && loadedPages === 0;

  return (
    <ProductDialog
      title={PRODUCT_FORM_COPY.picker.title}
      describedBy="product-picker-help"
      onClose={onClose}
      wide
      footer={
        <>
          <p className="product-picker__count">
            {PRODUCT_FORM_COPY.picker.selectionCount(staged.length)}
          </p>
          <div className="product-picker__actions">
            <button type="button" className="product-dialog__secondary" onClick={onClose}>
              {PRODUCT_FORM_COPY.picker.cancel}
            </button>
            <button
              type="button"
              className="product-dialog__primary"
              onClick={() => onConfirm(staged)}
            >
              {PRODUCT_FORM_COPY.picker.confirm}
            </button>
          </div>
        </>
      }
    >
      <p className="product-picker__help" id="product-picker-help">
        {PRODUCT_FORM_COPY.picker.help}
      </p>

      {query.isPending ? (
        <p className="product-picker__status" role="status">
          {PRODUCT_FORM_COPY.picker.loading}
        </p>
      ) : null}

      {firstPageFailed ? (
        <div className="product-picker__unavailable" role="alert">
          <p className="product-picker__unavailable-title">
            {PRODUCT_FORM_COPY.picker.unavailableTitle}
          </p>
          <p className="product-picker__unavailable-body">
            {PRODUCT_FORM_COPY.picker.unavailableBody}
          </p>
          <button
            type="button"
            className="product-dialog__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {PRODUCT_FORM_COPY.picker.retry}
          </button>
        </div>
      ) : null}

      {!query.isPending && !firstPageFailed && assets.length === 0 ? (
        <div className="product-picker__empty">
          <p className="product-picker__empty-title">{PRODUCT_FORM_COPY.picker.emptyTitle}</p>
          <p className="product-picker__empty-body">{PRODUCT_FORM_COPY.picker.emptyBody}</p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <ul className="product-picker__grid">
          {assets.map((asset) => {
            const checked = staged.includes(asset.assetId);
            const title = resolveMediaTitle(asset.mediaType);
            return (
              <li key={asset.assetId} className="product-picker__option">
                <label className="product-picker__label">
                  <input
                    type="checkbox"
                    className="product-picker__checkbox"
                    checked={checked}
                    onChange={() => toggle(asset.assetId)}
                  />
                  <AssetThumbnail
                    assetId={asset.assetId}
                    state="READY"
                    className="product-picker__thumb"
                  />
                  <span className="product-picker__info">
                    <span className="product-picker__title">{title}</span>
                    <span className="product-picker__meta">
                      {buildMediaMetaLine(asset.byteSize, asset.createdAt)}
                    </span>
                    <span className="product-picker__state">
                      {PRODUCT_FORM_COPY.picker.statusReady}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <div className="product-picker__continuation">
          {query.isError && loadedPages > 0 ? (
            <p className="product-picker__continuation-error" role="alert">
              {PRODUCT_FORM_COPY.picker.loadMoreFailed}
            </p>
          ) : null}
          <button
            type="button"
            className="product-dialog__secondary"
            onClick={() => {
              void query.fetchNextPage();
            }}
            disabled={query.isFetchingNextPage}
            aria-busy={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage
              ? PRODUCT_FORM_COPY.picker.loadingMore
              : query.isError
                ? PRODUCT_FORM_COPY.picker.retry
                : PRODUCT_FORM_COPY.picker.loadMore}
          </button>
        </div>
      ) : null}
    </ProductDialog>
  );
}
