'use client';

import { useMemo, useState } from 'react';

import { AssetThumbnail } from '../../../shared/media/asset-thumbnail';
import { flattenSelectableAssets } from '../model/product-asset-eligibility';
import { remainingCapacity } from '../model/product-media-capacity';
import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import { buildMediaMetaLine, resolveMediaTitle } from '../model/product-media-identity';
import { addToSelection, dedupe } from '../model/product-media-selection';
import { useSelectableAssetQuery } from '../hooks/use-selectable-asset-query';
import { ProductDialog } from './product-dialog';

interface ProductAssetPickerDialogProps {
  readonly selection: readonly string[];
  readonly onClose: () => void;
  readonly onConfirm: (selection: readonly string[]) => void;
}

/**
 * The media picker (`437:73`, amended by `938:187` / `938:255` / `949:187`).
 *
 * Only accepted catalog media appears — the filter is applied to the response,
 * not assumed of it, so an asset still being inspected or already rejected is
 * never offered. Each tile shows the image itself through `adminAsset_preview`
 * (`APP12-V02-C2`); before that contract existed there was no address to load
 * one from, so every tile was a neutral block.
 *
 * ## Capacity is enforced here, not discovered on save
 *
 * `APP12-M01.B2` refuses a set of more than twenty whole, and it refuses a
 * duplicate whole. Both are reachable only by a client that offers them, so
 * this one does not: an asset the product already carries is badged `Đã thêm`
 * and has no checkbox at all, and once the staged set reaches the cap every
 * unattached option is `aria-disabled` with `Đã đủ 20 ảnh` and the confirm
 * button is disabled. The refusals still exist and are still mapped — two tabs
 * can race — but they stop being the normal path.
 *
 * The capacity shown is the **staged** one, so a count that would exceed the cap
 * is unreachable rather than merely warned about, and the number the operator
 * reads always matches what confirming would produce.
 *
 * Continuation is explicit and cursor-based: a failed page leaves the loaded
 * tiles on screen and the retry re-sends the identical cursor. There is no
 * infinite scroll, no page number and no total — the contract publishes none.
 *
 * Selection is staged locally and applied on confirm, so dismissing the dialog
 * leaves the product's media exactly as it was.
 */
export function ProductAssetPickerDialog({
  selection,
  onClose,
  onConfirm,
}: ProductAssetPickerDialogProps) {
  const [staged, setStaged] = useState<readonly string[]>(() => dedupe(selection));
  const query = useSelectableAssetQuery(true);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const assets = useMemo(() => flattenSelectableAssets(pages), [pages]);

  const attached = useMemo(() => new Set(dedupe(selection)), [selection]);
  const chosen = staged.filter((id) => !attached.has(id));
  const remaining = remainingCapacity(staged.length);
  const full = remaining === 0;

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
      title={PRODUCT_MEDIA_COPY.picker.title}
      describedBy="product-picker-help"
      onClose={onClose}
      wide
      footer={
        <>
          <p className="product-picker__count">
            {PRODUCT_MEDIA_COPY.picker.footerCount(chosen.length, remaining)}
          </p>
          <div className="product-picker__actions">
            <button type="button" className="product-dialog__secondary" onClick={onClose}>
              {PRODUCT_MEDIA_COPY.picker.cancel}
            </button>
            <button
              type="button"
              className="product-dialog__primary"
              disabled={chosen.length === 0}
              onClick={() => onConfirm(staged)}
            >
              {PRODUCT_MEDIA_COPY.picker.confirm(chosen.length)}
            </button>
          </div>
        </>
      }
    >
      <div className="product-picker__capacity">
        <p className="product-picker__remaining" data-full={full ? 'true' : undefined}>
          {PRODUCT_MEDIA_COPY.picker.remaining(remaining)}
        </p>
        <p className="product-picker__help" id="product-picker-help">
          {PRODUCT_MEDIA_COPY.picker.help}
        </p>
      </div>

      {full ? (
        <p className="product-picker__full-notice" role="status">
          {PRODUCT_MEDIA_COPY.picker.fullNotice}
        </p>
      ) : null}

      {query.isPending ? (
        <p className="product-picker__status" role="status">
          {PRODUCT_MEDIA_COPY.picker.loading}
        </p>
      ) : null}

      {firstPageFailed ? (
        <div className="product-picker__unavailable" role="alert">
          <p className="product-picker__unavailable-title">
            {PRODUCT_MEDIA_COPY.picker.unavailableTitle}
          </p>
          <p className="product-picker__unavailable-body">
            {PRODUCT_MEDIA_COPY.picker.unavailableBody}
          </p>
          <button
            type="button"
            className="product-dialog__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {PRODUCT_MEDIA_COPY.picker.retry}
          </button>
        </div>
      ) : null}

      {!query.isPending && !firstPageFailed && assets.length === 0 ? (
        <div className="product-picker__empty">
          <p className="product-picker__empty-title">{PRODUCT_MEDIA_COPY.picker.emptyTitle}</p>
          <p className="product-picker__empty-body">{PRODUCT_MEDIA_COPY.picker.emptyBody}</p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <ul className="product-picker__grid">
          {assets.map((asset) => {
            const alreadyAdded = attached.has(asset.assetId);
            const checked = staged.includes(asset.assetId);
            // An option is blocked when the product already carries it, or when
            // choosing it would take the staged set past the cap. Unchecking
            // something already chosen stays available at 20/20 — otherwise the
            // operator would be locked out of correcting their own selection.
            const blocked = alreadyAdded || (full && !checked);
            const title = resolveMediaTitle(asset.mediaType);
            return (
              <li
                key={asset.assetId}
                className="product-picker__option"
                data-blocked={blocked ? 'true' : undefined}
              >
                <label className="product-picker__label">
                  {alreadyAdded ? (
                    <span className="product-picker__added">
                      {PRODUCT_MEDIA_COPY.picker.alreadyAdded}
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      className="product-picker__checkbox"
                      checked={checked}
                      aria-disabled={blocked || undefined}
                      onChange={() => {
                        if (!blocked) {
                          toggle(asset.assetId);
                        }
                      }}
                    />
                  )}
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
                      {blocked && !alreadyAdded
                        ? PRODUCT_MEDIA_COPY.picker.full
                        : PRODUCT_MEDIA_COPY.picker.statusReady}
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
              {PRODUCT_MEDIA_COPY.picker.loadMoreFailed}
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
              ? PRODUCT_MEDIA_COPY.picker.loadingMore
              : query.isError
                ? PRODUCT_MEDIA_COPY.picker.retry
                : PRODUCT_MEDIA_COPY.picker.loadMore}
          </button>
        </div>
      ) : null}
    </ProductDialog>
  );
}
