'use client';

import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';
import { useShare } from '../hooks/use-share';

interface DetailShareButtonProps {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
}

/**
 * The single Share control.
 *
 * The outcome is announced through a polite live region rather than a toast: a
 * copy that succeeds silently is indistinguishable from one that failed if you
 * cannot see the clipboard, and `aria-live="polite"` says so without stealing
 * focus from wherever the visitor is.
 */
export function DetailShareButton({ name, path, description }: DetailShareButtonProps) {
  const { announcement, share } = useShare({
    name,
    path,
    ...(description === undefined ? {} : { description }),
  });

  return (
    <div className="product-detail__share">
      <button type="button" className="product-detail__share-button" onClick={share}>
        {PRODUCT_DETAIL_COPY.share}
      </button>
      <p className="product-detail__share-status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
