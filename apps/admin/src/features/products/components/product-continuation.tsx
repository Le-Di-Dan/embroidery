'use client';

import { PRODUCT_COPY } from '../model/product-copy';

interface ProductContinuationProps {
  /** Only ever true when the last page reported `hasNext` and a usable cursor. */
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

/**
 * The explicit continuation control (`498:272` — Tải thêm sản phẩm, reusing the
 * `APP2-D02` cursor pattern approved for the asset library).
 *
 * It sits after the collection in the normal content flow — not floating, not
 * viewport-triggered, not automatic. Continuation is a user decision, and a
 * failure to continue is local to this control: the accumulated items stay on
 * screen and the retry re-sends the very same cursor rather than collapsing the
 * collection back to page one.
 *
 * There is no end-of-list sentence and no count: the contract exposes no total,
 * so any "x / y" copy would be invented.
 */
export function ProductContinuation({
  hasNext,
  loading,
  failed,
  onLoadMore,
}: ProductContinuationProps) {
  if (!hasNext) {
    return null;
  }

  return (
    <div className="product-continuation">
      {failed ? (
        <p className="product-continuation__error" role="alert">
          {PRODUCT_COPY.continuation.errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        className="product-continuation__action"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? <span className="product-continuation__spinner" aria-hidden="true" /> : null}
        {loading ? PRODUCT_COPY.continuation.loading : null}
        {!loading && failed ? PRODUCT_COPY.continuation.retry : null}
        {!loading && !failed ? PRODUCT_COPY.continuation.action : null}
      </button>
    </div>
  );
}
