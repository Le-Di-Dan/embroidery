'use client';

import { useRouter } from 'next/navigation';

import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * The route-local failure surface for anything that is not a safe 404.
 *
 * Deliberately says nothing about the cause. The visitor cannot act on a status
 * code, a request id or an exception message, and every one of those is a
 * detail about our infrastructure that a public page has no business carrying.
 * It also names no gallery entry: a failure must not confirm that the slug in
 * the address bar exists.
 *
 * Retry is a real authoritative refresh, not a re-render of the same failed
 * tree: `router.refresh()` discards the client's copy of the segment and makes
 * the server load the entry again, then `reset()` re-mounts the boundary. The
 * order matters — resetting alone would replay the identical failed render.
 */
export function GalleryDetailError({ reset }: { reset: () => void }) {
  const router = useRouter();

  return (
    <div className="gallery-detail gallery-detail--error">
      <h1 className="gallery-detail__error-heading">{GALLERY_DETAIL_COPY.errorHeading}</h1>
      <p className="gallery-detail__error-body">{GALLERY_DETAIL_COPY.errorBody}</p>
      <button
        type="button"
        className="gallery-detail__error-retry"
        onClick={() => {
          router.refresh();
          reset();
        }}
      >
        {GALLERY_DETAIL_COPY.errorRetry}
      </button>
    </div>
  );
}
