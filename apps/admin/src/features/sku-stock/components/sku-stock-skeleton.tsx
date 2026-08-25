'use client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';

const METRIC_SLOTS = [0, 1, 2, 3];
const ROW_SLOTS = [0, 1, 2, 3, 4];

/**
 * The loading state (`776:54`).
 *
 * The skeleton reproduces the **final** layout — a context strip, four metric
 * cards, a five-row table — so the page does not reflow when the answer
 * arrives. `776:141` is explicit about why: an operator reading a stock figure
 * must not have it jump under the cursor at the moment the table appears.
 *
 * `role="status"` with a real sentence, because a loading state that is only a
 * pattern of grey bars announces nothing at all. The bars themselves are
 * `aria-hidden`.
 */
export function SkuStockSkeleton() {
  return (
    <div className="stock-skeleton" role="status" data-testid="stock-loading">
      <span className="stock-skeleton__label">{COPY.page.loading}</span>
      <div className="stock-skeleton__context" aria-hidden="true">
        <span className="stock-skeleton__bar stock-skeleton__bar--sm" />
        <span className="stock-skeleton__bar stock-skeleton__bar--lg" />
        <span className="stock-skeleton__bar stock-skeleton__bar--md" />
      </div>
      <div className="stock-skeleton__metrics" aria-hidden="true">
        {METRIC_SLOTS.map((slot) => (
          <div key={slot} className="stock-skeleton__metric">
            <span className="stock-skeleton__bar stock-skeleton__bar--sm" />
            <span className="stock-skeleton__bar stock-skeleton__bar--lg" />
            <span className="stock-skeleton__bar stock-skeleton__bar--md" />
          </div>
        ))}
      </div>
      <div className="stock-skeleton__table" aria-hidden="true">
        {ROW_SLOTS.map((slot) => (
          <span key={slot} className="stock-skeleton__row" />
        ))}
      </div>
    </div>
  );
}
