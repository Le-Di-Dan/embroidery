/**
 * Exact-count instrumentation for the four fulfilment transitions
 * (`APP12-H03` §7, §22, §26.8).
 *
 * The shipping-fee command is one operation with two meanings, and which one
 * ran is a fact of the committed result rather than of the request — so the
 * set/correct distinction is asserted here against `succeededAs`, which is the
 * only thing that reads it.
 */
import { MetricRegistry, renderMetrics } from '@embroidery/observability';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import { orderDeliveryError } from '../../domain/lifecycle/order-delivery.errors';
import { isOrderDeliveryError } from '../../domain/lifecycle/order-delivery.errors';
import { OrderFulfilmentMetrics } from './order-fulfilment.metrics';

interface Harness {
  readonly metrics: OrderFulfilmentMetrics;
  readonly scrape: () => Promise<string>;
}

function harness(): Harness {
  const registry = new MetricRegistry('api');
  return {
    metrics: new OrderFulfilmentMetrics(new ApiCommerceMetrics(registry)),
    scrape: () => renderMetrics(registry),
  };
}

function seriesValue(body: string, line: string): number {
  const match = body.split('\n').find((candidate) => candidate.startsWith(line));
  return match === undefined ? 0 : Number(match.slice(line.length).trim());
}

function series(
  transition: string,
  outcome: string,
  reason: string,
  origin = 'READY_MADE',
): string {
  return `embroidery_fulfilment_transition_total{service="api",transition="${transition}",origin="${origin}",outcome="${outcome}",reason_class="${reason}"}`;
}

const recognize = (error: unknown): string | undefined =>
  isOrderDeliveryError(error) ? error.failure : undefined;

describe('fulfilment transition metrics', () => {
  it.each(['dispatch', 'complete'] as const)(
    'records exactly one success for one committed %s',
    async (transition) => {
      const { metrics, scrape } = harness();

      const observation = metrics.start(transition, recognize);
      observation.origin('READY_MADE');
      observation.succeeded();
      const body = await scrape();

      expect(seriesValue(body, series(transition, 'success', 'other'))).toBe(1);
    },
  );

  it('records a first fee as set and a later one as corrected', async () => {
    const { metrics, scrape } = harness();

    const first = metrics.start('shipping_fee_set', recognize);
    first.origin('READY_MADE');
    first.succeededAs('shipping_fee_set');

    const correction = metrics.start('shipping_fee_set', recognize);
    correction.origin('READY_MADE');
    correction.succeededAs('shipping_fee_corrected');

    const body = await scrape();

    expect(seriesValue(body, series('shipping_fee_set', 'success', 'other'))).toBe(1);
    expect(seriesValue(body, series('shipping_fee_corrected', 'success', 'other'))).toBe(1);
  });

  it('records a lifecycle refusal as refused, never as a system error', async () => {
    const { metrics, scrape } = harness();

    const observation = metrics.start('dispatch', recognize);
    observation.origin('READY_MADE');
    observation.failed(orderDeliveryError('ORDER_INVALID_TRANSITION'));
    const body = await scrape();

    expect(seriesValue(body, series('dispatch', 'refused', 'ORDER_INVALID_TRANSITION'))).toBe(1);
    expect(seriesValue(body, series('dispatch', 'system_error', 'other'))).toBe(0);
  });

  it('records an unclassified failure as a system error', async () => {
    const { metrics, scrape } = harness();

    const observation = metrics.start('complete', recognize);
    observation.origin('READY_MADE');
    observation.failed(new Error('deadlock detected'));
    const body = await scrape();

    expect(seriesValue(body, series('complete', 'system_error', 'other'))).toBe(1);
  });

  it('keeps the two origins as separate series', async () => {
    const { metrics, scrape } = harness();

    for (const origin of ['READY_MADE', 'CUSTOM']) {
      const observation = metrics.start('dispatch', recognize);
      observation.origin(origin);
      observation.succeeded();
    }
    const body = await scrape();

    expect(seriesValue(body, series('dispatch', 'success', 'other', 'READY_MADE'))).toBe(1);
    expect(seriesValue(body, series('dispatch', 'success', 'other', 'CUSTOM'))).toBe(1);
  });

  it('uses a bounded stand-in when the origin was never resolved', async () => {
    const { metrics, scrape } = harness();

    // The order row was not found, so nothing named an origin.
    const observation = metrics.start('dispatch', recognize);
    observation.failed(orderDeliveryError('ORDER_NOT_FOUND'));
    const body = await scrape();

    expect(seriesValue(body, series('dispatch', 'refused', 'ORDER_NOT_FOUND', 'other'))).toBe(1);
  });
});
