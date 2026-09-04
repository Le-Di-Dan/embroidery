/**
 * Exact-count instrumentation for payment verification (`APP12-H03` §22).
 *
 * The criterion this file exists for is **"payment verify replay → no duplicate
 * success"**. A retry of a call whose response was lost writes nothing; if it
 * incremented the success series anyway, the panel that answers "are payments
 * being verified" would over-report every flaky network, and an operator would
 * believe money moved twice.
 *
 * The other half is §26.26: a routed `REQUIRES_REVIEW` is a correct, committed
 * outcome and must never reach a system-failure alert.
 */
import { MetricRegistry, renderMetrics } from '@embroidery/observability';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import { paymentVerificationError } from '../../domain/verification/payment-verification.errors';
import type { PaymentDecisionView } from './admin-payment.view';
import { PaymentVerificationMetrics } from './payment-verification.metrics';

interface Harness {
  readonly metrics: PaymentVerificationMetrics;
  readonly scrape: () => Promise<string>;
}

function harness(): Harness {
  const registry = new MetricRegistry('api');
  return {
    metrics: new PaymentVerificationMetrics(new ApiCommerceMetrics(registry)),
    scrape: () => renderMetrics(registry),
  };
}

function seriesValue(body: string, line: string): number {
  const match = body.split('\n').find((candidate) => candidate.startsWith(line));
  return match === undefined ? 0 : Number(match.slice(line.length).trim());
}

function decision(overrides: Partial<PaymentDecisionView> = {}): PaymentDecisionView {
  return {
    attemptId: 'attempt',
    attemptStatus: 'SUCCEEDED',
    depositObligationId: 'obligation',
    depositStatus: 'SATISFIED',
    orderId: 'order',
    orderStatus: 'READY_FOR_DELIVERY',
    reconciliationAction: 'MANUAL_MATCH',
    replayed: false,
    ...overrides,
  };
}

const FULL_SUCCESS =
  'embroidery_payment_verification_total{service="api",payment_kind="FULL",outcome="success",reason_class="other"}';
const FULL_SYSTEM_ERROR =
  'embroidery_payment_verification_total{service="api",payment_kind="FULL",outcome="system_error",reason_class="other"}';
const RESERVATION_CONSUMED =
  'embroidery_inventory_reservation_total{service="api",transition="consume",outcome="success",reason_class="other"}';

function refused(reason: string, kind = 'FULL'): string {
  return `embroidery_payment_verification_total{service="api",payment_kind="${kind}",outcome="refused",reason_class="${reason}"}`;
}

describe('payment verification metrics', () => {
  it('records exactly one success and one reservation consume for one FULL settlement', async () => {
    const { metrics, scrape } = harness();

    const observation = metrics.start();
    observation.paymentKind('FULL');
    observation.settled(decision());
    const body = await scrape();

    expect(seriesValue(body, FULL_SUCCESS)).toBe(1);
    expect(seriesValue(body, RESERVATION_CONSUMED)).toBe(1);
  });

  it('does not count a replay as a second success', async () => {
    const { metrics, scrape } = harness();

    const first = metrics.start();
    first.paymentKind('FULL');
    first.settled(decision());

    const retry = metrics.start();
    retry.paymentKind('FULL');
    retry.settled(decision({ replayed: true }));

    const body = await scrape();

    expect(seriesValue(body, FULL_SUCCESS)).toBe(1);
    expect(seriesValue(body, refused('REPLAYED'))).toBe(1);
    // The replay consumed no stock either — it wrote nothing at all.
    expect(seriesValue(body, RESERVATION_CONSUMED)).toBe(1);
  });

  it('records a routed review as a refusal, never as a system error', async () => {
    const { metrics, scrape } = harness();

    const observation = metrics.start();
    observation.paymentKind('FULL');
    observation.settled(decision({ attemptStatus: 'REQUIRES_REVIEW', depositStatus: 'PENDING' }));
    const body = await scrape();

    expect(seriesValue(body, refused('REQUIRES_REVIEW'))).toBe(1);
    expect(seriesValue(body, FULL_SYSTEM_ERROR)).toBe(0);
    expect(seriesValue(body, FULL_SUCCESS)).toBe(0);
    // A review routing moves no stock.
    expect(seriesValue(body, RESERVATION_CONSUMED)).toBe(0);
  });

  it.each([
    'PAYMENT_ATTEMPT_ALREADY_SETTLED',
    'PAYMENT_OBLIGATION_NOT_PAYABLE',
    'PAYMENT_ORDER_NOT_AWAITING_PAYMENT',
  ] as const)('records the stale refusal %s as refused', async (failure) => {
    const { metrics, scrape } = harness();

    const observation = metrics.start();
    observation.paymentKind('FULL');
    observation.failed(paymentVerificationError(failure));
    const body = await scrape();

    expect(seriesValue(body, refused(failure))).toBe(1);
    expect(seriesValue(body, FULL_SYSTEM_ERROR)).toBe(0);
  });

  it('records an unclassified failure as a system error', async () => {
    const { metrics, scrape } = harness();

    const observation = metrics.start();
    observation.paymentKind('FULL');
    observation.failed(new Error('deadlock detected'));
    const body = await scrape();

    expect(seriesValue(body, FULL_SYSTEM_ERROR)).toBe(1);
    expect(seriesValue(body, FULL_SUCCESS)).toBe(0);
  });

  it('uses a bounded stand-in when the obligation kind was never resolved', async () => {
    const { metrics, scrape } = harness();

    // The chain threw before the locked row could name a kind.
    const observation = metrics.start();
    observation.failed(new Error('connection terminated'));
    const body = await scrape();

    expect(
      seriesValue(
        body,
        'embroidery_payment_verification_total{service="api",payment_kind="other",outcome="system_error",reason_class="other"}',
      ),
    ).toBe(1);
  });

  it('consumes no reservation for a settled DEPOSIT or REMAINING', async () => {
    const { metrics, scrape } = harness();

    for (const kind of ['DEPOSIT', 'REMAINING']) {
      const observation = metrics.start();
      observation.paymentKind(kind);
      observation.settled(decision());
    }
    const body = await scrape();

    expect(seriesValue(body, RESERVATION_CONSUMED)).toBe(0);
    expect(
      seriesValue(
        body,
        'embroidery_payment_verification_total{service="api",payment_kind="DEPOSIT",outcome="success",reason_class="other"}',
      ),
    ).toBe(1);
  });
});
