'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useOrderQueueQuery } from '../hooks/use-order-queue-query';
import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';
import { isOrderQueueFiltered, type OrderQueueFilters } from '../model/order-queue-filters';
import { isOrderCursorRejected } from '../model/order-queue-failure';
import { flattenOrderQueuePages } from '../model/order-queue-rows';
import { OrderQueuePagination } from './order-queue-pagination';
import { OrderQueueSkeleton } from './order-queue-skeleton';
import { OrderQueueTable } from './order-queue-table';

interface OrderQueueCollectionProps {
  readonly filters: OrderQueueFilters;
  readonly onResetFilters: () => void;
}

/**
 * The queue and every data-derived state around it (`732:3`).
 *
 * The states are mutually exclusive and derived from the query, never from a
 * local flag: loading, first-page failure, empty, populated. Empty is shown only
 * when the server actually answered with no rows — never while loading and never
 * after a failure, both of which would tell an operator the workshop has no
 * orders when nothing at all is known. A load error is an error, not an empty
 * result.
 *
 * Which empty state applies is decided by the *filters*, not by the response: a
 * narrowed queue that found nothing says so and offers a reset, while an
 * unfiltered queue that is genuinely empty says the work has not arrived yet.
 * Getting this backwards sends the operator hunting for a filter they never set.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the queue, so the rows already on screen
 * are not thrown away.
 */
export function OrderQueueCollection({ filters, onResetFilters }: OrderQueueCollectionProps) {
  const query = useOrderQueueQuery(filters);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const rows = useMemo(() => flattenOrderQueuePages(pages), [pages]);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(ORDER_QUEUE_COPY.states.appended);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return <OrderQueueSkeleton />;
  }

  if (query.isError && loadedPageCount === 0) {
    const rejected = isOrderCursorRejected(query.error);
    return (
      <div className="order-collection__failure" role="alert" data-testid="order-queue-error">
        <p className="order-collection__failure-title">
          {rejected ? ORDER_QUEUE_COPY.states.cursorErrorTitle : ORDER_QUEUE_COPY.states.errorTitle}
        </p>
        {/* Bounded copy: the classification picks the sentence, so no server
            message, error code, SQL fragment or stack can reach the operator. */}
        <p className="order-collection__failure-body">
          {rejected ? ORDER_QUEUE_COPY.states.cursorErrorBody : ORDER_QUEUE_COPY.states.errorBody}
        </p>
        <button
          type="button"
          className="order-collection__action"
          data-testid="order-queue-retry"
          onClick={() => {
            void query.refetch();
          }}
        >
          {ORDER_QUEUE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    const filtered = isOrderQueueFiltered(filters);
    return (
      <div
        className="order-collection__empty"
        data-testid={filtered ? 'order-queue-filter-empty' : 'order-queue-empty'}
      >
        <p className="order-collection__empty-title">
          {filtered
            ? ORDER_QUEUE_COPY.states.filteredEmptyTitle
            : ORDER_QUEUE_COPY.states.emptyTitle}
        </p>
        <p className="order-collection__empty-body">
          {filtered ? ORDER_QUEUE_COPY.states.filteredEmptyBody : ORDER_QUEUE_COPY.states.emptyBody}
        </p>
        {/* The reset is offered only under an active filter. On a genuinely
            empty queue there would be nothing to reset — and no creation CTA
            either: an operator does not raise an order, the conversion worker
            does when a design is approved. */}
        {filtered ? (
          <button
            type="button"
            className="order-collection__action"
            data-testid="order-queue-empty-reset"
            onClick={onResetFilters}
          >
            {ORDER_QUEUE_COPY.filters.reset}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="order-collection">
      <OrderQueueTable rows={rows} />
      <p className="order-collection__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      <OrderQueuePagination
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        cursorRejected={query.isError && isOrderCursorRejected(query.error)}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
        onReload={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
