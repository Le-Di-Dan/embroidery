'use client';

import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';

interface ProductionQueuePaginationProps {
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

/**
 * Keyset continuation (`780:99`, `780:216`).
 *
 * One direction only. `APP8-B03` issues a forward cursor and nothing else — no
 * page numbers, no total, no previous link — so this offers exactly "Tải thêm
 * lệnh sản xuất" and never computes a position from the cursor, which is
 * opaque. Nothing here slices client-side either: every row on screen came from
 * a page the server returned, in the order it returned them.
 *
 * On the last page the control is replaced by `780:217`'s plain statement that
 * the end has been reached, so the absence of a button is explained rather than
 * merely observed — and the last page cannot produce another request.
 *
 * While a page is in flight the button is *natively* disabled — not merely
 * styled — so a second click is impossible rather than merely discouraged.
 *
 * A failed continuation keeps the loaded rows and offers a retry that re-sends
 * the same cursor. A **rejected** cursor never reaches this component: it is a
 * different recovery ("Về trang đầu") and the collection renders it, because
 * retrying a cursor the server has refused cannot succeed.
 */
export function ProductionQueuePagination({
  hasNext,
  loading,
  failed,
  onLoadMore,
}: ProductionQueuePaginationProps) {
  if (!hasNext) {
    return (
      <p className="production-pagination__note" data-testid="production-queue-exhausted">
        {PRODUCTION_QUEUE_COPY.states.exhausted}
      </p>
    );
  }

  return (
    <div className="production-pagination">
      {failed ? (
        <p className="production-pagination__error-body" role="alert">
          {PRODUCTION_QUEUE_COPY.states.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="production-pagination__action"
        disabled={loading}
        aria-busy={loading}
        data-testid="production-queue-load-more"
        onClick={onLoadMore}
      >
        {loading
          ? PRODUCTION_QUEUE_COPY.actions.loadingMore
          : failed
            ? PRODUCTION_QUEUE_COPY.actions.retry
            : PRODUCTION_QUEUE_COPY.actions.loadMore}
      </button>
      <p className="production-pagination__note">{PRODUCTION_QUEUE_COPY.states.pagination}</p>
    </div>
  );
}
