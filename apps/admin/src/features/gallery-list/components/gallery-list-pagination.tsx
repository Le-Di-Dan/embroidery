'use client';

import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';

interface GalleryListPaginationProps {
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

/**
 * Keyset continuation (`866:905`).
 *
 * One direction only. `APP11-B01` issues a forward cursor and nothing else — no
 * page numbers, no total, no previous link — so this offers exactly "Tải thêm
 * mục" and never computes a position from the cursor, which is opaque. Nothing
 * here slices client-side either: every row on screen came from a page the
 * server returned, in the order it returned them.
 *
 * It is an explicit control and not a viewport trigger: there is no infinite
 * scroll and no intersection observer, so a page is fetched when the operator
 * asks for one and never because they scrolled past a sentinel.
 *
 * On the last page the control is replaced by a plain statement that the end
 * has been reached, so the absence of a button is explained rather than merely
 * observed — and the last page cannot produce another request.
 *
 * While a page is in flight the button is *natively* disabled — not merely
 * styled — so a second click is impossible rather than merely discouraged.
 *
 * A failed continuation keeps the loaded rows and offers a retry that re-sends
 * the same cursor: `useInfiniteQuery` holds the failing page parameter, so the
 * retry asks for the page that failed and not for the first one.
 */
export function GalleryListPagination({
  hasNext,
  loading,
  failed,
  onLoadMore,
}: GalleryListPaginationProps) {
  if (!hasNext) {
    return (
      <p className="gallery-pagination__note" data-testid="gallery-list-exhausted">
        {GALLERY_LIST_COPY.states.exhausted}
      </p>
    );
  }

  return (
    <div className="gallery-pagination">
      {failed ? (
        <p className="gallery-pagination__error-body" role="alert">
          {GALLERY_LIST_COPY.states.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="gallery-pagination__action"
        disabled={loading}
        aria-busy={loading}
        data-testid="gallery-list-load-more"
        onClick={onLoadMore}
      >
        {loading
          ? GALLERY_LIST_COPY.actions.loadingMore
          : failed
            ? GALLERY_LIST_COPY.actions.retry
            : GALLERY_LIST_COPY.actions.loadMore}
      </button>
    </div>
  );
}
