'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useGalleryListQuery } from '../hooks/use-gallery-list-query';
import type { GalleryListFilterController } from '../hooks/use-gallery-list-filters';
import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import { classifyGalleryListFailure } from '../model/gallery-list-failure';
import { flattenGalleryListPages } from '../model/gallery-list-rows';
import { GalleryCardList } from './gallery-card-list';
import { GalleryListEmpty } from './gallery-list-empty';
import { GalleryListFailureState } from './gallery-list-failure-state';
import { GalleryListPagination } from './gallery-list-pagination';
import { GalleryListSkeleton } from './gallery-list-skeleton';
import { GalleryListTable } from './gallery-list-table';

interface GalleryListCollectionProps {
  readonly controller: GalleryListFilterController;
}

/**
 * The list and every data-derived state around it (`866:905`, `867:907`).
 *
 * The states are mutually exclusive and derived from the query, never from a
 * local flag: loading, first-page failure, empty, populated. Empty is shown only
 * when the server actually answered with no rows — never while loading and never
 * after a failure, both of which would tell an operator the gallery is empty
 * when nothing at all is known. A load error is an error, not an empty result.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the list, so the rows already on screen
 * are not thrown away and the scroll position is not disturbed. The retry
 * re-sends the same failed cursor.
 *
 * The rows are rendered in the order the server returned them and are never
 * re-sorted here. The table and the card list receive the same rows; the
 * stylesheet presents exactly one of them at any width.
 */
export function GalleryListCollection({ controller }: GalleryListCollectionProps) {
  const { filters } = controller;
  const query = useGalleryListQuery(filters);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const rows = useMemo(() => flattenGalleryListPages(pages), [pages]);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(GALLERY_LIST_COPY.states.appended);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return <GalleryListSkeleton />;
  }

  const failure = query.isError ? classifyGalleryListFailure(query.error) : undefined;

  if (failure !== undefined && loadedPageCount === 0) {
    return (
      <GalleryListFailureState
        failure={failure}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (rows.length === 0) {
    return <GalleryListEmpty controller={controller} />;
  }

  return (
    <div className="gallery-collection">
      <div className="gallery-collection__desktop">
        <GalleryListTable rows={rows} />
      </div>
      <div className="gallery-collection__mobile">
        <GalleryCardList rows={rows} />
      </div>
      <p className="gallery-collection__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      <GalleryListPagination
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </div>
  );
}
