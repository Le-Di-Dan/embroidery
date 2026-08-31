'use client';

import { useMemo, useState } from 'react';

import { AdminAssetListScope } from '@embroidery/api-client';

import { flattenEligibleAssets } from '../model/gallery-asset-lanes';
import { buildAssetMetaLine, resolveAssetTitle } from '../model/gallery-asset-identity';
import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import { addAssets } from '../model/gallery-media-selection';
import { useGalleryAssetQuery } from '../hooks/use-gallery-asset-query';
import { GalleryAssetThumb } from './gallery-asset-thumb';
import { GalleryDialog } from './gallery-dialog';

interface GalleryAssetPickerDialogProps {
  readonly selection: readonly string[];
  readonly onClose: () => void;
  readonly onConfirm: (selection: readonly string[]) => void;
}

/**
 * The gallery-image picker (`870:926`).
 *
 * ## The lane is named, never defaulted
 *
 * `scope=GALLERY` is passed explicitly. The list operation treats an omitted
 * scope as `CATALOG`, and a picker that quietly offered production-sensitive
 * product media here would look exactly like one that worked — right up to the
 * save the server refused. Eligibility is then applied to the response as well,
 * so an image still being prepared is never offered.
 *
 * ## Already-selected images are not offered again
 *
 * The entry's current selection is filtered out rather than shown checked. The
 * contract refuses a duplicate id outright, so an interface that let one be
 * chosen twice would exist only to produce a refusal — and the operator's real
 * question here is "what else can I add", not "what did I already add".
 *
 * ## Selection is staged and applied on confirm
 *
 * Dismissing the dialog leaves the entry's images exactly as they were, and
 * confirming only changes the *local* arrangement: nothing is persisted until
 * the media section's own save runs.
 *
 * ## Continuation is explicit and cursor-based
 *
 * "Tải thêm ảnh" appears only while a continuation exists, a failed page leaves
 * the loaded tiles on screen, and the retry re-sends the identical cursor
 * rather than restarting from the first page. There is no infinite scroll, no
 * page number and no total — the contract publishes none of them.
 */
export function GalleryAssetPickerDialog({
  selection,
  onClose,
  onConfirm,
}: GalleryAssetPickerDialogProps) {
  const [staged, setStaged] = useState<readonly string[]>([]);
  const query = useGalleryAssetQuery(AdminAssetListScope.GALLERY, true);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const available = useMemo(
    () =>
      flattenEligibleAssets(pages, AdminAssetListScope.GALLERY).filter(
        (asset) => !selection.includes(asset.assetId),
      ),
    [pages, selection],
  );

  const toggle = (assetId: string) =>
    setStaged((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : addAssets(current, [assetId]),
    );

  const copy = GALLERY_MEDIA_COPY.picker;
  const loadedPages = pages.length;
  const firstPageFailed = query.isError && loadedPages === 0;

  return (
    <GalleryDialog
      title={copy.title}
      describedBy="gallery-picker-help"
      wide
      onClose={onClose}
      testId="gallery-asset-picker"
      footer={
        <>
          <p className="gallery-picker__count">{copy.selectionCount(staged.length)}</p>
          <div className="gallery-dialog__actions">
            <button type="button" className="gallery-dialog__secondary" onClick={onClose}>
              {copy.cancel}
            </button>
            <button
              type="button"
              className="gallery-dialog__primary"
              disabled={staged.length === 0}
              onClick={() => onConfirm(addAssets(selection, staged))}
              data-testid="gallery-picker-confirm"
            >
              {copy.confirm}
            </button>
          </div>
        </>
      }
    >
      <p className="gallery-picker__help" id="gallery-picker-help">
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

      {!query.isPending && !firstPageFailed && available.length === 0 ? (
        <div className="gallery-picker__empty" data-testid="gallery-picker-empty">
          <p className="gallery-picker__empty-title">{copy.emptyTitle}</p>
          <p className="gallery-picker__empty-body">{copy.emptyBody}</p>
        </div>
      ) : null}

      {available.length > 0 ? (
        <ul className="gallery-picker__grid">
          {available.map((asset) => (
            <li key={asset.assetId} className="gallery-picker__option">
              <label className="gallery-picker__label">
                <GalleryAssetThumb assetId={asset.assetId} alt={copy.optionAlt} />
                <span className="gallery-picker__info">
                  <input
                    type="checkbox"
                    className="gallery-picker__checkbox"
                    checked={staged.includes(asset.assetId)}
                    onChange={() => toggle(asset.assetId)}
                  />
                  <span className="gallery-picker__text">
                    <span className="gallery-picker__title">
                      {resolveAssetTitle(asset.mediaType)}
                    </span>
                    <span className="gallery-picker__meta">
                      {buildAssetMetaLine(asset.byteSize, asset.createdAt)}
                    </span>
                  </span>
                </span>
              </label>
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
