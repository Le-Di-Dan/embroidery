/**
 * Exact-count instrumentation for Ready-Made creation (`APP12-H03` §22).
 *
 * §22 asks for counts and for one specific negative: a **rolled-back
 * transaction must not present as a success**. That property is structural
 * rather than asserted — `observeCreation` records only after the thunk
 * resolves, and `runInTransaction` resolves only after the commit — so the test
 * below drives it by rejecting the thunk, which is exactly what a rollback
 * looks like from here.
 *
 * Assertions read the **rendered scrape**, the same text Prometheus reads, so a
 * bug in the exposition would fail here too.
 */
import { MetricRegistry, renderMetrics } from '@embroidery/observability';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import { ReadyMadeOrderError } from '../../domain/ready-made/ready-made-order.errors';
import { ReadyMadeOrderMetrics } from './ready-made-order.metrics';

interface Harness {
  readonly metrics: ReadyMadeOrderMetrics;
  readonly scrape: () => Promise<string>;
}

function harness(): Harness {
  const registry = new MetricRegistry('api');
  const metrics = new ReadyMadeOrderMetrics(new ApiCommerceMetrics(registry));
  return { metrics, scrape: () => renderMetrics(registry) };
}

function seriesValue(body: string, line: string): number {
  const match = body.split('\n').find((candidate) => candidate.startsWith(line));
  return match === undefined ? 0 : Number(match.slice(line.length).trim());
}

const SUCCESS =
  'embroidery_order_create_total{service="api",origin="READY_MADE",outcome="success",reason_class="other"}';
const SYSTEM_ERROR =
  'embroidery_order_create_total{service="api",origin="READY_MADE",outcome="system_error",reason_class="other"}';
const RESERVATION_CREATED =
  'embroidery_inventory_reservation_total{service="api",transition="create",outcome="success",reason_class="other"}';

function refusal(reason: string): string {
  return `embroidery_order_create_total{service="api",origin="READY_MADE",outcome="refused",reason_class="${reason}"}`;
}

describe('Ready-Made order creation metrics', () => {
  it('records exactly one success and one reservation for one committed creation', async () => {
    const { metrics, scrape } = harness();

    await expect(
      metrics.observeCreation(() => Promise.resolve({ result: 'order', reserved: true })),
    ).resolves.toBe('order');
    const body = await scrape();

    expect(seriesValue(body, SUCCESS)).toBe(1);
    expect(seriesValue(body, RESERVATION_CREATED)).toBe(1);
    expect(
      seriesValue(
        body,
        'embroidery_order_create_duration_seconds_count{service="api",origin="READY_MADE",outcome="success"}',
      ),
    ).toBe(1);
  });

  it('records a replay as a success but not as a second reservation', async () => {
    const { metrics, scrape } = harness();

    // The first submit committed and took stock; the retry returns the same
    // order and takes none. Counting a reservation here would report inventory
    // movement that never happened.
    await metrics.observeCreation(() => Promise.resolve({ result: 'order', reserved: true }));
    await metrics.observeCreation(() => Promise.resolve({ result: 'order', reserved: false }));
    const body = await scrape();

    expect(seriesValue(body, SUCCESS)).toBe(2);
    expect(seriesValue(body, RESERVATION_CREATED)).toBe(1);
  });

  it('records no success at all for a rolled-back creation', async () => {
    const { metrics, scrape } = harness();

    await expect(
      metrics.observeCreation(() => Promise.reject(new Error('deadlock detected'))),
    ).rejects.toThrow('deadlock detected');
    const body = await scrape();

    expect(seriesValue(body, SUCCESS)).toBe(0);
    expect(seriesValue(body, RESERVATION_CREATED)).toBe(0);
    expect(seriesValue(body, SYSTEM_ERROR)).toBe(1);
  });

  it.each([
    'SKU_NOT_AVAILABLE',
    'VERIFIED_CONTACT_REQUIRED',
    'IDEMPOTENCY_CONFLICT',
    'DUPLICATE_OPERATION',
  ] as const)('records %s as a refusal, never as a system error', async (failure) => {
    const { metrics, scrape } = harness();

    await expect(
      metrics.observeCreation(() => Promise.reject(new ReadyMadeOrderError(failure))),
    ).rejects.toBeInstanceOf(ReadyMadeOrderError);
    const body = await scrape();

    expect(seriesValue(body, refusal(failure))).toBe(1);
    expect(seriesValue(body, SYSTEM_ERROR)).toBe(0);
    expect(seriesValue(body, SUCCESS)).toBe(0);
  });

  it('attributes an out-of-stock refusal to the reservation as well as to the order', async () => {
    const { metrics, scrape } = harness();

    await expect(
      metrics.observeCreation(() => Promise.reject(new ReadyMadeOrderError('INSUFFICIENT_STOCK'))),
    ).rejects.toBeInstanceOf(ReadyMadeOrderError);
    const body = await scrape();

    expect(seriesValue(body, refusal('INSUFFICIENT_STOCK'))).toBe(1);
    expect(
      seriesValue(
        body,
        'embroidery_inventory_reservation_total{service="api",transition="create",outcome="refused",reason_class="INSUFFICIENT_STOCK"}',
      ),
    ).toBe(1);
  });

  it('does not attribute an unrelated system error to the reservation', async () => {
    const { metrics, scrape } = harness();

    // A failure raised before the reservation step never touched inventory.
    // Recording it there would report a fault in a subsystem never called.
    await expect(
      metrics.observeCreation(() => Promise.reject(new Error('connection terminated'))),
    ).rejects.toThrow();
    const body = await scrape();

    expect(body).not.toContain('transition="create"');
  });

  it('never puts an order id, a customer contact or an error message in a label', async () => {
    const { metrics, scrape } = harness();

    await metrics.observeCreation(() => Promise.resolve({ result: 'order', reserved: true }));
    await metrics
      .observeCreation(() =>
        Promise.reject(new Error('order 6f1c9a3e-0f2b-4a71-9d55-2b7a1c4e88f0 for +84901234567')),
      )
      .catch(() => undefined);
    const body = await scrape();

    const labelValues = [...body.matchAll(/="([^"]*)"/g)].map((match) => match[1] ?? '');
    for (const value of labelValues) {
      expect(value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(value).not.toMatch(/\+?84\d{8,}/);
      expect(value).not.toContain(' ');
    }
  });
});
