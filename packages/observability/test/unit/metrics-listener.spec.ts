/**
 * The internal metrics listener (`APP12-H03` §10).
 *
 * Proves the three properties the deployment depends on: it answers `/metrics`
 * and nothing else, it renders the registry it was given, and it is a separate
 * port from the business application — which is what makes the Gateway denial
 * in §18 a property of the topology rather than of a routing rule.
 */
import { MetricRegistry } from '../../src/metrics/metric-registry';
import {
  METRICS_PATH,
  resolveMetricsEnabled,
  resolveMetricsPort,
  startMetricsListener,
  type MetricsListener,
} from '../../src/metrics/metrics-listener';

describe('metrics listener', () => {
  let listener: MetricsListener | undefined;

  afterEach(async () => {
    await listener?.close();
    listener = undefined;
  });

  async function start(): Promise<{ port: number; registry: MetricRegistry }> {
    const registry = new MetricRegistry('worker');
    registry.counter({ name: 'embroidery_x_total', help: 'x', labelNames: [] }).inc({});
    // Port 0 lets the OS choose a free one, so the suite never collides with a
    // developer's running stack.
    listener = await startMetricsListener({ registry, port: 0, host: '127.0.0.1' });
    return { port: listener.port, registry };
  }

  it('serves the registry on /metrics', async () => {
    const { port } = await start();
    const response = await fetch(`http://127.0.0.1:${String(port)}${METRICS_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('version=0.0.4');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.text()).resolves.toContain('embroidery_x_total{service="worker"} 1');
  });

  it('answers 404 on every other path', async () => {
    const { port } = await start();
    for (const path of ['/', '/health', '/metrics/', '/api/health', '/debug']) {
      const response = await fetch(`http://127.0.0.1:${String(port)}${path}`);
      expect(response.status).toBe(404);
    }
  });

  it('refuses a non-GET method without rendering', async () => {
    const { port } = await start();
    const response = await fetch(`http://127.0.0.1:${String(port)}${METRICS_PATH}`, {
      method: 'POST',
    });
    expect(response.status).toBe(405);
  });
});

describe('listener configuration', () => {
  it('defaults to the internal port when unset', () => {
    expect(resolveMetricsPort(undefined)).toBe(9464);
    expect(resolveMetricsPort('')).toBe(9464);
  });

  it('accepts an explicit port', () => {
    expect(resolveMetricsPort('9999')).toBe(9999);
  });

  it.each(['0', '70000', 'abc', '9464.5'])('refuses the invalid port %s', (raw) => {
    expect(() => resolveMetricsPort(raw)).toThrow(/Invalid METRICS_PORT/);
  });

  it('is enabled unless explicitly disabled', () => {
    expect(resolveMetricsEnabled(undefined)).toBe(true);
    expect(resolveMetricsEnabled('true')).toBe(true);
    expect(resolveMetricsEnabled('false')).toBe(false);
    expect(() => resolveMetricsEnabled('no')).toThrow(/Invalid METRICS_ENABLED/);
  });
});
