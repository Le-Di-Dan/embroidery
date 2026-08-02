'use client';

import { useRouter } from 'next/navigation';

import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

/**
 * The route-local failure surface for anything that is not a safe 404.
 *
 * Deliberately says nothing about the cause. The visitor cannot act on a status
 * code, a request id or an exception message, and every one of those is a
 * detail about our infrastructure that a public page has no business carrying.
 *
 * Retry is a real authoritative refresh, not a re-render of the same failed
 * tree: `router.refresh()` discards the client's copy of the segment and makes
 * the server load the Product again, then `reset()` re-mounts the boundary. The
 * order matters — resetting alone would replay the identical failed render.
 */
export function DetailError({ reset }: { reset: () => void }) {
  const router = useRouter();

  return (
    <div className="product-detail product-detail--error">
      <h1 className="product-detail__error-heading">{PRODUCT_DETAIL_COPY.errorHeading}</h1>
      <p className="product-detail__error-body">{PRODUCT_DETAIL_COPY.errorBody}</p>
      <button
        type="button"
        className="product-detail__error-retry"
        onClick={() => {
          router.refresh();
          reset();
        }}
      >
        {PRODUCT_DETAIL_COPY.errorRetry}
      </button>
    </div>
  );
}
