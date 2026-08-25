'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useProductionQueueQuery,
  useProductionQueueReset,
} from '../hooks/use-production-queue-query';
import type { ProductionQueueFilterController } from '../hooks/use-production-queue-filters';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import { classifyProductionQueueFailure } from '../model/production-queue-failure';
import { flattenProductionQueuePages } from '../model/production-queue-rows';
import { ProductionQueueEmpty } from './production-queue-empty';
import { ProductionQueueFailureState } from './production-queue-failure-state';
import { ProductionQueuePagination } from './production-queue-pagination';
import { ProductionQueueSkeleton } from './production-queue-skeleton';
import { ProductionQueueTable } from './production-queue-table';

interface ProductionQueueCollectionProps {
  readonly controller: ProductionQueueFilterController;
}

/**
 * The queue and every data-derived state around it (`780:3`).
 *
 * The states are mutually exclusive and derived from the query, never from a
 * local flag: loading, first-page failure, empty, populated. Empty is shown only
 * when the server actually answered with no rows — never while loading and never
 * after a failure, both of which would tell an operator the workshop has no
 * work when nothing at all is known. A load error is an error, not an empty
 * result.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the queue, so the rows already on screen
 * are not thrown away. The one exception is a rejected cursor: the accumulated
 * pages are still shown, but the recovery offered is "Về trang đầu", because
 * re-sending a cursor the server refused cannot succeed.
 *
 * The rows are rendered in the order the server returned them and are never
 * re-sorted here.
 */
export function ProductionQueueCollection({ controller }: ProductionQueueCollectionProps) {
  const { filters } = controller;
  const query = useProductionQueueQuery(filters);
  const backToFirstPage = useProductionQueueReset(filters);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const rows = useMemo(() => flattenProductionQueuePages(pages), [pages]);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(PRODUCTION_QUEUE_COPY.states.appended);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return <ProductionQueueSkeleton />;
  }

  const failure = query.isError ? classifyProductionQueueFailure(query.error) : undefined;

  if (failure !== undefined && loadedPageCount === 0) {
    return (
      <ProductionQueueFailureState
        failure={failure}
        onRetry={() => {
          void query.refetch();
        }}
        onBackToFirstPage={backToFirstPage}
      />
    );
  }

  if (rows.length === 0) {
    return <ProductionQueueEmpty controller={controller} />;
  }

  return (
    <div className="production-collection">
      <ProductionQueueTable rows={rows} />
      <p className="production-collection__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      {failure === 'cursorRejected' ? (
        <ProductionQueueFailureState
          failure={failure}
          onRetry={() => {
            void query.refetch();
          }}
          onBackToFirstPage={backToFirstPage}
        />
      ) : (
        <ProductionQueuePagination
          hasNext={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isError}
          onLoadMore={() => {
            void query.fetchNextPage();
          }}
        />
      )}
      <p className="production-collection__ordering">{PRODUCTION_QUEUE_COPY.page.ordering}</p>
    </div>
  );
}
