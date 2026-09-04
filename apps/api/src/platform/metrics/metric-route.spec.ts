/**
 * The route dimension, which is where an identifier would leak
 * (`APP12-H03` §5, §6, §26.4, §26.12).
 *
 * The whole point of this projection is that it is *stricter* than the logging
 * one: `safeRoute` may fall back to a concrete pathname, and this may not. Every
 * test below exists because the corresponding mistake would produce a Prometheus
 * series per order.
 */
import { isExcludedFromHttpMetrics, metricMethod, metricRouteTemplate, UNMATCHED_ROUTE } from './metric-route';

describe('metricRouteTemplate', () => {
  it('uses the route template when the framework matched one', () => {
    expect(
      metricRouteTemplate({ baseUrl: '/api', route: { path: '/orders/:orderId' } }),
    ).toBe('/api/orders/:orderId');
  });

  it('needs no base url', () => {
    expect(metricRouteTemplate({ route: { path: '/api/health' } })).toBe('/api/health');
  });

  it.each([
    ['a concrete path with a UUID', { originalUrl: '/api/orders/6f1c9a3e-0f2b-4a71-9d55-2b7a1c4e88f0' }],
    ['a concrete path with a code', { originalUrl: '/api/orders/DH-2026-000123' }],
    ['a path with a query string', { originalUrl: '/api/public/products?category=ao-thun' }],
    ['nothing at all', {}],
  ])('refuses to derive a template from %s', (_label, request) => {
    expect(metricRouteTemplate(request)).toBe(UNMATCHED_ROUTE);
  });

  it('refuses an over-long template rather than storing it', () => {
    expect(metricRouteTemplate({ route: { path: `/api/${'x'.repeat(200)}` } })).toBe(
      UNMATCHED_ROUTE,
    );
  });

  it('refuses a template outside the safe character set', () => {
    expect(metricRouteTemplate({ route: { path: '/api/orders/{orderId}' } })).toBe(UNMATCHED_ROUTE);
  });
});

describe('excluded operational routes', () => {
  it.each(['/api/health', '/api/health/readiness'])('excludes %s from the business view', (route) => {
    expect(isExcludedFromHttpMetrics(route)).toBe(true);
  });

  it('does not exclude a business route', () => {
    expect(isExcludedFromHttpMetrics('/api/public/ready-made-orders')).toBe(false);
  });
});

describe('metricMethod', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('passes %s through', (method) => {
    expect(metricMethod({ method })).toBe(method);
  });

  it('upper-cases a lowercase method', () => {
    expect(metricMethod({ method: 'post' })).toBe('POST');
  });

  it.each(['PROPFIND', '', 'GET /etc/passwd'])('folds the unknown method %s into other', (method) => {
    expect(metricMethod({ method })).toBe('other');
  });
});
