'use client';

import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';

interface OrderQueuePaginationProps {
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  /** True when the server rejected the cursor itself; retrying cannot help. */
  readonly cursorRejected: boolean;
  readonly onLoadMore: () => void;
  readonly onReload: () => void;
}

/**
 * Keyset continuation (`732:3`).
 *
 * One direction only. `APP7-B02` issues a forward cursor and nothing else — no
 * page numbers, no total, no previous link — so this offers exactly "Tải thêm
 * đơn hàng" and never computes a position from the cursor, which is opaque.
 * Nothing here slices client-side either: every row on screen came from a page
 * the server returned, in the order it returned them.
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
export function OrderQueuePagination({
  hasNext,
  loading,
  failed,
  cursorRejected,
  onLoadMore,
  onReload,
}: OrderQueuePaginationProps) {
  if (cursorRejected) {
    return (
      <div className="order-pagination" role="alert">
        <p className="order-pagination__error-title">{ORDER_QUEUE_COPY.states.cursorErrorTitle}</p>
        <p className="order-pagination__error-body">{ORDER_QUEUE_COPY.states.cursorErrorBody}</p>
        <button
          type="button"
          className="order-pagination__action"
          data-testid="order-queue-cursor-reload"
          onClick={onReload}
        >
          {ORDER_QUEUE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  if (!hasNext) return null;

  return (
    <div className="order-pagination">
      {failed ? (
        <p className="order-pagination__error-body" role="alert">
          {ORDER_QUEUE_COPY.states.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="order-pagination__action"
        disabled={loading}
        aria-busy={loading}
        data-testid="order-queue-load-more"
        onClick={onLoadMore}
      >
        {loading
          ? ORDER_QUEUE_COPY.actions.loadingMore
          : failed
            ? ORDER_QUEUE_COPY.actions.retry
            : ORDER_QUEUE_COPY.actions.loadMore}
      </button>
    </div>
  );
}
