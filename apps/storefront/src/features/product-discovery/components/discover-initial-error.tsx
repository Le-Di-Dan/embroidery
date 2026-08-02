import { DISCOVER_COPY } from '../model/discover-copy';

/**
 * The first page could not be loaded.
 *
 * `role="alert"` because it is actionable and replaces the content the visitor
 * came for. The copy never carries the API's message, status code, request id or
 * cursor — a visitor learns that the feed is unavailable, not how it failed.
 * "Thử lại" triggers a real refetch, not a page-level reload.
 */
export function DiscoverInitialError({ onRetry }: { onRetry: () => void }) {
  const { initialError } = DISCOVER_COPY;
  return (
    <div className="discover__notice" role="alert">
      <p className="discover__notice-heading">{initialError.heading}</p>
      <p className="discover__notice-body">{initialError.body}</p>
      <button type="button" className="discover__action" onClick={onRetry}>
        {initialError.action}
      </button>
    </div>
  );
}
