'use client';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';

interface DesignTemplatePaginationProps {
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  /** True when the server rejected the cursor itself; retrying cannot help. */
  readonly cursorRejected: boolean;
  readonly onLoadMore: () => void;
  readonly onReload: () => void;
}

/**
 * Keyset continuation (`596:8`).
 *
 * One direction only. `APP3-B03` issues a forward cursor and nothing else — no
 * page numbers, no total, no previous link — so this offers exactly "Trang sau"
 * and never computes a position. Nothing here slices client-side either: every
 * row on screen came from a page the server returned.
 *
 * A failed continuation keeps the loaded rows and offers a retry that re-sends
 * the *same* cursor. A **rejected** cursor is different and gets a different
 * control: the server will not accept that cursor however many times it is
 * offered, so the only honest action is reloading the list from its first page —
 * stated as such, rather than silently restarting behind the operator's back.
 */
export function DesignTemplatePagination({
  hasNext,
  loading,
  failed,
  cursorRejected,
  onLoadMore,
  onReload,
}: DesignTemplatePaginationProps) {
  if (cursorRejected) {
    return (
      <div className="design-template-pagination" role="alert">
        <p className="design-template-pagination__error-title">
          {DESIGN_TEMPLATE_COPY.states.cursorErrorTitle}
        </p>
        <p className="design-template-pagination__error-body">
          {DESIGN_TEMPLATE_COPY.states.cursorErrorBody}
        </p>
        <button
          type="button"
          className="design-template-pagination__action"
          data-testid="template-cursor-reload"
          onClick={onReload}
        >
          {DESIGN_TEMPLATE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  if (!hasNext) return null;

  return (
    <div className="design-template-pagination">
      {failed ? (
        <p className="design-template-pagination__error-body" role="alert">
          {DESIGN_TEMPLATE_COPY.states.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="design-template-pagination__action"
        disabled={loading}
        aria-busy={loading}
        data-testid="template-load-more"
        onClick={onLoadMore}
      >
        {loading
          ? DESIGN_TEMPLATE_COPY.actions.loadingMore
          : failed
            ? DESIGN_TEMPLATE_COPY.actions.retry
            : DESIGN_TEMPLATE_COPY.actions.loadMore}
      </button>
    </div>
  );
}
