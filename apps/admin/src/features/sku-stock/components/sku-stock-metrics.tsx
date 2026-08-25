'use client';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { availableTone } from '../model/stock-presentation';

interface SkuStockMetricsProps {
  readonly stock: AdminSkuStockResponse;
}

interface MetricProps {
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly tone: 'neutral' | 'info' | 'success' | 'error';
  readonly testId: string;
}

function Metric({ label, value, note, tone, testId }: MetricProps) {
  return (
    <div className={`stock-metric stock-metric--${tone}`}>
      <p className="stock-metric__label">{label}</p>
      <p className="stock-metric__value" data-testid={testId}>
        {value}
      </p>
      <p className="stock-metric__note">{note}</p>
    </div>
  );
}

/**
 * The four published figures (`775:40`, `775:138`, `776:30`).
 *
 * Every one of them is rendered exactly as `adminSkuStock_get` published it.
 * `available` in particular is **not** recomputed from the other three: the
 * server computes it under the `sku_stocks` row lock and this component would
 * disagree with it the moment a reservation landed between two renders.
 *
 * A negative `available` is rendered in the error tone and otherwise treated as
 * an ordinary number — `775:151` draws `−3` because reservations exceeding
 * on-hand is a valid consequence of the reservation model, not data corruption.
 * Nothing is clamped to zero and nothing is labelled invalid.
 *
 * At the approved narrow viewport (`789:36`/`789:45`) the four cards fall into a
 * 2×2 grid rather than being hidden or collapsed: the stylesheet lets them wrap
 * on their own basis, so no metric is ever dropped at 1280.
 */
export function SkuStockMetrics({ stock }: SkuStockMetricsProps) {
  return (
    <div className="stock-metrics" data-testid="stock-metrics">
      <Metric
        label={COPY.metrics.onHand}
        value={stock.quantityOnHand}
        note={COPY.metrics.onHandNote}
        tone="neutral"
        testId="stock-metric-on-hand"
      />
      <Metric
        label={COPY.metrics.held}
        value={stock.heldQuantity}
        note={COPY.metrics.heldNote}
        tone="neutral"
        testId="stock-metric-held"
      />
      <Metric
        label={COPY.metrics.reserved}
        value={stock.reservedQuantity}
        note={COPY.metrics.reservedNote}
        tone="info"
        testId="stock-metric-reserved"
      />
      <Metric
        label={COPY.metrics.available}
        value={stock.available}
        note={COPY.metrics.availableNote}
        tone={availableTone(stock.available)}
        testId="stock-metric-available"
      />
    </div>
  );
}
