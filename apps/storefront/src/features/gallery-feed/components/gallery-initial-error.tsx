'use client';

import { GALLERY_COPY } from '../model/gallery-copy';

/**
 * The first page could not be loaded (UI05 `357:3`).
 *
 * `role="alert"` because it is actionable and replaces the content the visitor
 * came for. The copy never carries the API's message, status code, request id or
 * cursor — a visitor learns that the gallery is unavailable, not how it failed.
 * "Thử lại" triggers a real refetch of the first page, not a page reload.
 */
export function GalleryInitialError({ onRetry }: { onRetry: () => void }) {
  const { initialError } = GALLERY_COPY;
  return (
    <div className="gallery-feed__notice" role="alert">
      <p className="gallery-feed__notice-heading">{initialError.heading}</p>
      <button type="button" className="gallery-feed__action" onClick={onRetry}>
        {initialError.action}
      </button>
    </div>
  );
}
