/**
 * The Wave-1 metric catalogue as a whole (`APP12-H03` §7, §8, §26.11–.13).
 *
 * The contract tests prove the *rules*; these prove that every family this
 * checkpoint actually ships obeys them, and that the catalogue covers each
 * domain the acceptance criteria name. A family added later without a label
 * declaration fails the first test here; one added with an identifier label
 * fails the second.
 */
import { createCommerceMetrics } from '../../src/catalog/commerce-metrics';
import {
  createDependencyMetrics,
  createHttpMetrics,
} from '../../src/catalog/platform-metrics';
import { reasonClass, statusClass } from '../../src/catalog/metric-vocabulary';
import { createWorkerMetrics } from '../../src/catalog/worker-metrics';
import { renderMetrics } from '../../src/metrics/exposition';
import {
  ALLOWED_METRIC_LABEL_NAMES,
  isForbiddenLabelName,
} from '../../src/metrics/metric-label';
import { MetricRegistry } from '../../src/metrics/metric-registry';

function apiRegistry(): MetricRegistry {
  const registry = new MetricRegistry('api');
  createHttpMetrics(registry);
  createCommerceMetrics(registry);
  createDependencyMetrics(registry);
  return registry;
}

function workerRegistry(): MetricRegistry {
  const registry = new MetricRegistry('worker');
  createWorkerMetrics(registry);
  createDependencyMetrics(registry);
  return registry;
}

describe('the shipped catalogue obeys the contract', () => {
  it.each([
    ['api', apiRegistry],
    ['worker', workerRegistry],
  ])('%s declares no forbidden label', (_service, build) => {
    const offenders = build()
      .list()
      .flatMap((instrument) =>
        instrument.labelNames
          .filter((name) => isForbiddenLabelName(name))
          .map((name) => `${instrument.name}.${name}`),
      );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['api', apiRegistry],
    ['worker', workerRegistry],
  ])('%s declares only allow-listed labels', (_service, build) => {
    const offenders = build()
      .list()
      .flatMap((instrument) =>
        instrument.labelNames
          .filter((name) => !(ALLOWED_METRIC_LABEL_NAMES as readonly string[]).includes(name))
          .map((name) => `${instrument.name}.${name}`),
      );
    expect(offenders).toEqual([]);
  });

  it('covers every Wave-1 domain the acceptance criteria name', () => {
    const names = new Set([
      ...apiRegistry()
        .list()
        .map((instrument) => instrument.name),
      ...workerRegistry()
        .list()
        .map((instrument) => instrument.name),
    ]);
    for (const required of [
      'embroidery_http_requests_total',
      'embroidery_http_request_duration_seconds',
      'embroidery_order_create_total',
      'embroidery_payment_verification_total',
      'embroidery_inventory_reservation_total',
      'embroidery_fulfilment_transition_total',
      'embroidery_notification_delivery_total',
      'embroidery_worker_job_attempts_total',
      'embroidery_worker_queue_pending',
      'embroidery_dependency_errors_total',
    ]) {
      expect(names).toContain(required);
    }
  });
});

describe('route templates never carry an identifier', () => {
  it('records the template, not the concrete path', async () => {
    const registry = new MetricRegistry('api');
    createHttpMetrics(registry).requestCompleted({
      method: 'GET',
      routeTemplate: '/api/orders/:orderId',
      statusClass: '2xx',
      durationSeconds: 0.01,
    });
    const body = await renderMetrics(registry);
    expect(body).toContain('route_template="/api/orders/:orderId"');
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe('reason and status classification', () => {
  it('passes through a deliberate domain code', () => {
    expect(reasonClass('SKU_NOT_AVAILABLE')).toBe('SKU_NOT_AVAILABLE');
  });

  it.each([
    ['a formatted message', 'Order 5f3c is not payable'],
    ['a lowercase identifier', 'a3f9c2b1'],
    ['an undefined code', undefined],
    ['an over-long code', 'A'.repeat(60)],
  ])('folds %s into other', (_label, code) => {
    expect(reasonClass(code)).toBe('other');
  });

  it.each([
    [200, '2xx'],
    [201, '2xx'],
    [302, '3xx'],
    [409, '4xx'],
    [503, '5xx'],
    [999, 'other'],
    [Number.NaN, 'other'],
  ])('projects %s onto %s', (code, expected) => {
    expect(statusClass(code)).toBe(expected);
  });
});

describe('the scrape body carries no PII or secret marker', () => {
  it('renders a realistic full catalogue with none of the forbidden shapes', async () => {
    const registry = new MetricRegistry('api');
    const http = createHttpMetrics(registry);
    const commerce = createCommerceMetrics(registry);
    http.requestCompleted({
      method: 'POST',
      routeTemplate: '/api/ready-made-orders',
      statusClass: '2xx',
      durationSeconds: 0.2,
    });
    commerce.recordOrderCreate({
      origin: 'READY_MADE',
      outcome: 'success',
      reasonClass: 'other',
      durationSeconds: 0.2,
    });
    commerce.recordPaymentVerification({
      paymentKind: 'FULL',
      outcome: 'refused',
      reasonClass: 'STALE_ATTEMPT',
      durationSeconds: 0.05,
    });
    const body = await renderMetrics(registry);

    // Only the label *values* are inspected. A metric name is authored in this
    // repository and is allowed to be long; a label value is the only part of
    // the scrape that carries runtime data, so it is the only part where a
    // leak can occur — and asserting on the whole body instead would flag
    // `embroidery_http_request_duration_seconds_bucket` as a bearer token.
    const values = [...body.matchAll(/="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      // A UUID, an email, an international phone number and a bearer-looking
      // opaque token are the four shapes an accidental leak would take.
      expect(value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(value).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(value).not.toMatch(/\+?84\d{8,}/);
      expect(value).not.toMatch(/^[A-Za-z0-9_-]{32,}$/);
    }
  });
});
