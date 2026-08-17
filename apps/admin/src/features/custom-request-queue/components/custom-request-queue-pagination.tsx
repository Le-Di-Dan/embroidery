'use client';

import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';

interface CustomRequestQueuePaginationProps {
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  /** True when the server rejected the cursor itself; retrying cannot help. */
  readonly cursorRejected: boolean;
  readonly onLoadMore: () => void;
  readonly onReload: () => void;
}

/**
 * Keyset continuation (`662:3`).
 *
 * One direction only. `APP5-B04` issues a forward cursor and nothing else — no
 * page numbers, no total, no previous link — so this offers exactly "Trang sau"
 * and never computes a position from the cursor, which is opaque. Nothing here
 * slices client-side either: every row on screen came from a page the server
 * returned, in the order it returned them.
 *
 * The control disappears entirely when `hasNext` is false, so the last page
 * cannot produce another request. While a page is in flight the button is
 * *natively* disabled — not merely styled — so a second click is impossible
 * rather than merely discouraged.
 *
 * A failed continuation keeps the loaded rows and offers a retry that re-sends
 * the same cursor. A **rejected** cursor gets a different control: the server
 * will not accept that cursor however many times it is offered, so the only
 * honest action is reloading from the first page — stated as such, rather than
 * the queue silently restarting behind the operator's back.
 */
export function CustomRequestQueuePagination({
  hasNext,
  loading,
  failed,
  cursorRejected,
  onLoadMore,
  onReload,
}: CustomRequestQueuePaginationProps) {
  if (cursorRejected) {
    return (
      <div className="custom-request-pagination" role="alert">
        <p className="custom-request-pagination__error-title">
          {CUSTOM_REQUEST_QUEUE_COPY.states.cursorErrorTitle}
        </p>
        <p className="custom-request-pagination__error-body">
          {CUSTOM_REQUEST_QUEUE_COPY.states.cursorErrorBody}
        </p>
        <button
          type="button"
          className="custom-request-pagination__action"
          data-testid="request-queue-cursor-reload"
          onClick={onReload}
        >
          {CUSTOM_REQUEST_QUEUE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  if (!hasNext) return null;

  return (
    <div className="custom-request-pagination">
      {failed ? (
        <p className="custom-request-pagination__error-body" role="alert">
          {CUSTOM_REQUEST_QUEUE_COPY.states.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="custom-request-pagination__action"
        disabled={loading}
        aria-busy={loading}
        data-testid="request-queue-load-more"
        onClick={onLoadMore}
      >
        {loading
          ? CUSTOM_REQUEST_QUEUE_COPY.actions.loadingMore
          : failed
            ? CUSTOM_REQUEST_QUEUE_COPY.actions.retry
            : CUSTOM_REQUEST_QUEUE_COPY.actions.loadMore}
      </button>
    </div>
  );
}
