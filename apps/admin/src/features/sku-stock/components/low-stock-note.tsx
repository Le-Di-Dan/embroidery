'use client';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';

interface LowStockNoteProps {
  readonly stock: AdminSkuStockResponse;
}

/**
 * What the screen says about the low-stock threshold (`775:57`, `775:155`,
 * `776:53`).
 *
 * Three truthful states and no fourth:
 *
 * - **flag on** — the warning banner, naming the configured threshold, with the
 *   sentence that keeps the semantics straight: `lowStock` compares on-hand
 *   with the threshold, holds and reservations do not raise it, and a negative
 *   availability is a valid consequence rather than a data fault.
 * - **flag off, threshold configured** — a quiet note stating both facts.
 * - **no threshold** — a quiet note saying the flag is always `false` and that
 *   nothing is inferred from the quantity. No threshold is guessed, no default
 *   is substituted and no editable fallback appears.
 *
 * The threshold is **read-only everywhere**. `APP8-B01` publishes no
 * threshold-authoring operation, so this screen offers no control that could
 * pretend to change one (`787:148`).
 */
export function LowStockNote({ stock }: LowStockNoteProps) {
  if (stock.lowStock) {
    return (
      <div className="stock-banner stock-banner--warning" data-testid="low-stock-banner">
        <span className="stock-banner__mark" aria-hidden="true">
          ▲
        </span>
        <div className="stock-banner__body">
          <p className="stock-banner__title">
            {stock.lowStockThreshold === undefined
              ? COPY.pill.lowStock
              : COPY.threshold.lowStockTitle(stock.lowStockThreshold)}
          </p>
          <p className="stock-banner__text">{COPY.threshold.lowStockBody}</p>
        </div>
      </div>
    );
  }

  return (
    <p className="stock-note" data-testid="low-stock-note">
      {stock.lowStockThreshold === undefined
        ? COPY.threshold.absent
        : COPY.threshold.configured(stock.lowStockThreshold)}
    </p>
  );
}
