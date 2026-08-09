'use client';

import { useMemo, useState } from 'react';

import { PLACEMENT_COPY } from '../model/placement-copy';
import { flattenEligibleBackgrounds } from '../model/background-eligibility';
import { useBackgroundAssetQuery } from '../hooks/use-background-asset-query';
import { PlacementDialog } from './placement-dialog';

interface PlacementBackgroundDialogProps {
  readonly selectedAssetId: string;
  readonly onClose: () => void;
  readonly onConfirm: (assetId: string) => void;
}

/**
 * The side-background picker (`596:7`, background selection).
 *
 * Only assets the server would actually accept appear — accepted catalog media
 * in raster form. The filter is applied to the response, not assumed of it, so
 * an asset still being inspected, one that was rejected, and an SVG are never
 * offered. Choosing one and then being refused is a worse experience than not
 * seeing it.
 *
 * Every tile is a placeholder. There is no authenticated Admin delivery
 * contract, so there is no image to show and no URL to construct — and nothing
 * here renders a storage key, a bucket, a checksum or an object address.
 *
 * Selection is staged locally and applied on confirm, so dismissing the dialog
 * leaves the side's background exactly as it was.
 */
export function PlacementBackgroundDialog({
  selectedAssetId,
  onClose,
  onConfirm,
}: PlacementBackgroundDialogProps) {
  const [staged, setStaged] = useState(selectedAssetId);
  const query = useBackgroundAssetQuery(true);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const assets = useMemo(() => flattenEligibleBackgrounds(pages), [pages]);

  const loadedPages = pages.length;
  const firstPageFailed = query.isError && loadedPages === 0;

  return (
    <PlacementDialog
      title={PLACEMENT_COPY.picker.title}
      describedBy="placement-picker-help"
      onClose={onClose}
      wide
      footer={
        <div className="placement-dialog__actions">
          <button type="button" className="placement-dialog__secondary" onClick={onClose}>
            {PLACEMENT_COPY.picker.cancel}
          </button>
          <button
            type="button"
            className="placement-dialog__primary"
            disabled={staged === ''}
            data-testid="placement-background-confirm"
            onClick={() => {
              onConfirm(staged);
            }}
          >
            {PLACEMENT_COPY.picker.confirm}
          </button>
        </div>
      }
    >
      <p className="placement-picker__help" id="placement-picker-help">
        {PLACEMENT_COPY.picker.help}
      </p>

      {query.isPending ? (
        <p className="placement-picker__status" role="status">
          {PLACEMENT_COPY.picker.loading}
        </p>
      ) : null}

      {firstPageFailed ? (
        <div className="placement-picker__unavailable" role="alert">
          <p className="placement-picker__unavailable-title">
            {PLACEMENT_COPY.picker.unavailableTitle}
          </p>
          <p className="placement-picker__unavailable-body">
            {PLACEMENT_COPY.picker.unavailableBody}
          </p>
          <button
            type="button"
            className="placement-dialog__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {PLACEMENT_COPY.picker.retry}
          </button>
        </div>
      ) : null}

      {!query.isPending && !firstPageFailed && assets.length === 0 ? (
        <div className="placement-picker__empty">
          <p className="placement-picker__empty-title">{PLACEMENT_COPY.picker.emptyTitle}</p>
          <p className="placement-picker__empty-body">{PLACEMENT_COPY.picker.emptyBody}</p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <ul className="placement-picker__grid">
          {assets.map((asset) => (
            <li key={asset.assetId} className="placement-picker__option">
              <label className="placement-picker__label">
                <input
                  type="radio"
                  name="placement-background"
                  className="placement-picker__radio"
                  checked={staged === asset.assetId}
                  onChange={() => {
                    setStaged(asset.assetId);
                  }}
                />
                <span className="placement-picker__thumb" aria-hidden="true" />
                <span className="placement-picker__info">
                  <span className="placement-picker__type">{asset.mediaType}</span>
                  <span className="placement-picker__state">
                    {PLACEMENT_COPY.picker.thumbnailPlaceholder}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <div className="placement-picker__continuation">
          {query.isError && loadedPages > 0 ? (
            <p className="placement-picker__continuation-error" role="alert">
              {PLACEMENT_COPY.picker.loadMoreFailed}
            </p>
          ) : null}
          <button
            type="button"
            className="placement-dialog__secondary"
            onClick={() => {
              void query.fetchNextPage();
            }}
            disabled={query.isFetchingNextPage}
            aria-busy={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage
              ? PLACEMENT_COPY.picker.loadingMore
              : query.isError
                ? PLACEMENT_COPY.picker.retry
                : PLACEMENT_COPY.picker.loadMore}
          </button>
        </div>
      ) : null}
    </PlacementDialog>
  );
}
