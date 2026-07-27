'use client';

import { ASSET_COPY } from '../model/asset-copy';

interface AssetContinuationProps {
  /** Only ever true when the last page reported `hasNext` and a usable cursor. */
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

/**
 * The explicit continuation control (`APP2-D02` / IMP-D031, Figma `484:272`).
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
export function AssetContinuation({
  hasNext,
  loading,
  failed,
  onLoadMore,
}: AssetContinuationProps) {
  if (!hasNext) {
    return null;
  }

  return (
    <div className="asset-continuation">
      {failed ? (
        <p className="asset-continuation__error" role="alert">
          {ASSET_COPY.continuation.errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        className="asset-continuation__action"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? <span className="asset-continuation__spinner" aria-hidden="true" /> : null}
        {loading ? ASSET_COPY.continuation.loading : null}
        {!loading && failed ? ASSET_COPY.continuation.retry : null}
        {!loading && !failed ? ASSET_COPY.continuation.action : null}
      </button>
    </div>
  );
}
