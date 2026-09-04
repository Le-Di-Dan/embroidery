/**
 * Registry, instruments and exposition (`APP12-H03` §5, §6, §23).
 *
 * Covers the properties every alert rule silently depends on: counters are
 * monotonic, histograms are cumulative, the series cap actually caps, a
 * collector that fails does not blank the scrape, and the rendered body is
 * valid Prometheus text with the process's `service` label on every series.
 */
import { renderMetrics } from '../../src/metrics/exposition';
import { MetricContractError } from '../../src/metrics/metric-label';
import { MetricRegistry } from '../../src/metrics/metric-registry';
import { MAX_SERIES_PER_METRIC } from '../../src/metrics/metric-series';

function registry(): MetricRegistry {
  return new MetricRegistry('api');
}

describe('MetricRegistry', () => {
  it('refuses to register the same metric name twice', () => {
    const target = registry();
    target.counter({ name: 'embroidery_x_total', help: 'x', labelNames: [] });
    expect(() => {
      target.counter({ name: 'embroidery_x_total', help: 'x', labelNames: [] });
    }).toThrow(/already registered/);
  });

  it('refuses a family declaring a forbidden label at construction time', () => {
    expect(() => {
      registry().counter({
        name: 'embroidery_x_total',
        help: 'x',
        // @ts-expect-error the contract is enforced at runtime as well as in types
        labelNames: ['orderId'],
      });
    }).toThrow(MetricContractError);
  });

  it('stamps the service label on every rendered series', async () => {
    const target = new MetricRegistry('worker');
    target.counter({ name: 'embroidery_x_total', help: 'x', labelNames: ['outcome'] }).inc({
      outcome: 'success',
    });
    const body = await renderMetrics(target);
    expect(body).toContain('embroidery_x_total{service="worker",outcome="success"} 1');
  });
});

describe('Counter', () => {
  it('increments only upwards', () => {
    const counter = registry().counter({
      name: 'embroidery_x_total',
      help: 'x',
      labelNames: ['outcome'],
    });
    counter.inc({ outcome: 'success' });
    counter.inc({ outcome: 'success' }, 4);
    counter.inc({ outcome: 'success' }, -10);
    counter.inc({ outcome: 'success' }, Number.NaN);
    expect(counter.entries()[0]?.value).toBe(5);
  });

  it('keeps distinct label sets as distinct series', () => {
    const counter = registry().counter({
      name: 'embroidery_x_total',
      help: 'x',
      labelNames: ['outcome'],
    });
    counter.inc({ outcome: 'success' });
    counter.inc({ outcome: 'refused' });
    expect(counter.entries()).toHaveLength(2);
  });

  it('refuses a label value that breaks the contract', () => {
    const counter = registry().counter({
      name: 'embroidery_x_total',
      help: 'x',
      labelNames: ['outcome'],
    });
    expect(() => {
      counter.inc({ outcome: 'customer@example.com' });
    }).toThrow(MetricContractError);
  });

  it('drops rather than grows past the series cap', () => {
    const target = registry();
    const counter = target.counter({
      name: 'embroidery_x_total',
      help: 'x',
      labelNames: ['reason_class'],
    });
    for (let index = 0; index < MAX_SERIES_PER_METRIC + 25; index += 1) {
      counter.inc({ reason_class: `R_${String(index)}` });
    }
    expect(counter.entries()).toHaveLength(MAX_SERIES_PER_METRIC);
    expect(counter.dropped()).toBe(25);
    expect(target.droppedSeries()).toBe(25);
  });
});

describe('Histogram', () => {
  it('accumulates buckets cumulatively and ignores impossible observations', () => {
    const histogram = registry().histogram({
      name: 'embroidery_x_duration_seconds',
      help: 'x',
      labelNames: ['outcome'],
      buckets: [0.1, 1],
    });
    histogram.observe({ outcome: 'success' }, 0.05);
    histogram.observe({ outcome: 'success' }, 0.5);
    histogram.observe({ outcome: 'success' }, 5);
    histogram.observe({ outcome: 'success' }, -1);
    histogram.observe({ outcome: 'success' }, Number.POSITIVE_INFINITY);

    const series = histogram.entries()[0];
    expect(series?.value.counts).toEqual([1, 2]);
    expect(series?.value.count).toBe(3);
    expect(series?.value.sum).toBeCloseTo(5.55, 5);
  });

  it('renders bucket, sum and count lines including +Inf', async () => {
    const target = registry();
    target
      .histogram({
        name: 'embroidery_x_duration_seconds',
        help: 'x',
        labelNames: [],
        buckets: [0.1],
      })
      .observe({}, 0.05);
    const body = await renderMetrics(target);
    expect(body).toContain('embroidery_x_duration_seconds_bucket{service="api",le="0.1"} 1');
    expect(body).toContain('embroidery_x_duration_seconds_bucket{service="api",le="+Inf"} 1');
    expect(body).toContain('embroidery_x_duration_seconds_count{service="api"} 1');
    expect(body).toContain('# TYPE embroidery_x_duration_seconds histogram');
  });
});

describe('collectors', () => {
  it('runs a collector before rendering', async () => {
    const target = registry();
    const gauge = target.gauge({ name: 'embroidery_x', help: 'x', labelNames: [] });
    target.registerCollector({
      name: 'x',
      collect: async () => {
        gauge.set({}, 42);
        return Promise.resolve();
      },
    });
    const body = await renderMetrics(target);
    expect(body).toContain('embroidery_x{service="api"} 42');
  });

  it('counts a failing collector without blanking the rest of the scrape', async () => {
    const target = registry();
    target.counter({ name: 'embroidery_x_total', help: 'x', labelNames: [] }).inc({});
    target.registerCollector({
      name: 'broken',
      collect: () => Promise.reject(new Error('database unreachable')),
    });
    const body = await renderMetrics(target);
    expect(body).toContain('embroidery_x_total{service="api"} 1');
    expect(body).toContain(
      'embroidery_metrics_collector_failures_total{service="api",operation="broken"} 1',
    );
  });

  it('never leaks a collector error message into the scrape', async () => {
    const target = registry();
    target.registerCollector({
      name: 'broken',
      collect: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.1:5432')),
    });
    const body = await renderMetrics(target);
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.0.0.1');
  });
});
