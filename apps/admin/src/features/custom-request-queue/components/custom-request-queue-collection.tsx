'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';
import {
  isAnyQueueFilterActive,
  type CustomRequestQueueFilters,
} from '../model/custom-request-queue-filters';
import { isCursorRejected } from '../model/custom-request-queue-failure';
import { flattenQueuePages } from '../model/custom-request-queue-rows';
import { useCustomRequestQueueQuery } from '../hooks/use-custom-request-queue-query';
import { CustomRequestQueuePagination } from './custom-request-queue-pagination';
import { CustomRequestQueueScope } from './custom-request-queue-scope';
import { CustomRequestQueueSkeleton } from './custom-request-queue-skeleton';
import { CustomRequestQueueTable } from './custom-request-queue-table';

interface CustomRequestQueueCollectionProps {
  readonly filters: CustomRequestQueueFilters;
  readonly onResetFilters: () => void;
}

/**
 * The queue and every data-derived state around it (`662:3`, `662:112`,
 * `662:182`, `662:243`, `662:306`).
 *
 * The states are mutually exclusive and derived from the query, never from a
 * local flag: loading, first-page failure, empty, populated. Empty is shown only
 * when the server actually answered with no rows — never while loading and never
 * after a failure, both of which would tell an operator the workshop has no
 * pending requests when nothing at all is known. A load error is an error, not
 * an empty result.
 *
 * Which empty state applies is decided by the *filters*, not by the response: a
 * narrowed queue that found nothing says so and offers a reset, while an
 * unfiltered triage queue that is genuinely empty says the work has not arrived
 * yet. Getting this backwards sends the operator hunting for a filter they never
 * set.
 *
 * Once any page has loaded, a later failure is a *continuation* failure and
 * stays confined to the control below the queue, so the rows already on screen
 * are not thrown away.
 */
export function CustomRequestQueueCollection({
  filters,
  onResetFilters,
}: CustomRequestQueueCollectionProps) {
  const query = useCustomRequestQueueQuery(filters);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const rows = useMemo(() => flattenQueuePages(pages), [pages]);
  const loadedPageCount = pages.length;

  // One polite announcement per successful append — not one per query event.
  const [appendAnnouncement, setAppendAnnouncement] = useState('');
  const previousPageCount = useRef(loadedPageCount);
  useEffect(() => {
    if (loadedPageCount > previousPageCount.current && previousPageCount.current > 0) {
      setAppendAnnouncement(CUSTOM_REQUEST_QUEUE_COPY.states.appended);
    }
    previousPageCount.current = loadedPageCount;
  }, [loadedPageCount]);

  if (query.isPending) {
    return <CustomRequestQueueSkeleton />;
  }

  if (query.isError && loadedPageCount === 0) {
    const rejected = isCursorRejected(query.error);
    return (
      <div
        className="custom-request-collection__failure"
        role="alert"
        data-testid="request-queue-error"
      >
        <p className="custom-request-collection__failure-title">
          {rejected
            ? CUSTOM_REQUEST_QUEUE_COPY.states.cursorErrorTitle
            : CUSTOM_REQUEST_QUEUE_COPY.states.errorTitle}
        </p>
        {/* Bounded copy: the classification picks the sentence, so no server
            message, error code, SQL fragment or stack can reach the operator. */}
        <p className="custom-request-collection__failure-body">
          {rejected
            ? CUSTOM_REQUEST_QUEUE_COPY.states.cursorErrorBody
            : CUSTOM_REQUEST_QUEUE_COPY.states.errorBody}
        </p>
        <button
          type="button"
          className="custom-request-collection__action"
          data-testid="request-queue-retry"
          onClick={() => {
            void query.refetch();
          }}
        >
          {CUSTOM_REQUEST_QUEUE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  // The scope statement belongs to every answered state, empty included: an
  // empty triage queue still has to say *which* statuses it triaged.
  const appliedStatuses = pages[0]?.appliedStatuses ?? [];

  if (rows.length === 0) {
    const filtered = isAnyQueueFilterActive(filters);
    return (
      <>
        <CustomRequestQueueScope appliedStatuses={appliedStatuses} />
        <div
          className="custom-request-collection__empty"
          data-testid={filtered ? 'request-queue-filter-empty' : 'request-queue-empty'}
        >
          <p className="custom-request-collection__empty-title">
            {filtered
              ? CUSTOM_REQUEST_QUEUE_COPY.states.filteredEmptyTitle
              : CUSTOM_REQUEST_QUEUE_COPY.states.emptyTitle}
          </p>
          <p className="custom-request-collection__empty-body">
            {filtered
              ? CUSTOM_REQUEST_QUEUE_COPY.states.filteredEmptyBody
              : CUSTOM_REQUEST_QUEUE_COPY.states.emptyBody}
          </p>
          {/* The reset is offered only under an active filter. On a genuinely
              empty queue there would be nothing to reset — and no creation CTA
              either: an Admin does not raise a customer's request. */}
          {filtered ? (
            <button
              type="button"
              className="custom-request-collection__action"
              data-testid="request-queue-empty-reset"
              onClick={onResetFilters}
            >
              {CUSTOM_REQUEST_QUEUE_COPY.filters.reset}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="custom-request-collection">
      <CustomRequestQueueScope appliedStatuses={appliedStatuses} />
      <CustomRequestQueueTable rows={rows} />
      <p className="custom-request-collection__sr-status" role="status" aria-live="polite">
        {appendAnnouncement}
      </p>
      <CustomRequestQueuePagination
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        cursorRejected={query.isError && isCursorRejected(query.error)}
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
