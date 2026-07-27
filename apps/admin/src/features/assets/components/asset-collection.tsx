'use client';

import { useEffect, useRef, useState } from 'react';

import { ASSET_COPY } from '../model/asset-copy';
import { flattenAssetPages } from '../model/asset-pages';
import { useAssetListQuery } from '../hooks/use-asset-list-query';
import { AssetCard } from './asset-card';
import { AssetContinuation } from './asset-continuation';

/**
 * The asset collection and every data-derived state around it.
 *
 * The four presentations are mutually exclusive and derived from the query, not
 * from a local flag: loading, first-page failure, empty and populated. Empty is
 * shown only when the server actually answered with no items — never while
 * loading and never after a failure, both of which would claim the operator has
 * no assets when nothing is known.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the collection.
 */
export function AssetCollection() {
  const query = useAssetListQuery();
  const pages = query.data?.pages ?? [];
  const items = flattenAssetPages(pages);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(ASSET_COPY.continuation.loaded);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return (
      <p className="assets__list-status" role="status">
        {ASSET_COPY.list.loading}
      </p>
    );
  }

  if (query.isError && loadedPageCount === 0) {
    return (
      <div className="assets__list-unavailable" role="alert">
        <p className="assets__list-unavailable-title">{ASSET_COPY.list.unavailableTitle}</p>
        <p className="assets__list-unavailable-body">{ASSET_COPY.list.unavailableDescription}</p>
        <button
          type="button"
          className="assets__list-unavailable-action"
          onClick={() => {
            void query.refetch();
          }}
        >
          {ASSET_COPY.list.unavailableRetry}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="assets__empty">
        <p className="assets__empty-title">{ASSET_COPY.list.emptyTitle}</p>
        <p className="assets__empty-body">{ASSET_COPY.list.emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="asset-grid" aria-label={ASSET_COPY.page.collectionLabel}>
        {items.map((asset) => (
          <AssetCard key={asset.assetId} asset={asset} />
        ))}
      </ul>
      <p className="assets__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      <AssetContinuation
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </>
  );
}
