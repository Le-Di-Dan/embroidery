/**
 * The route dimension of the HTTP metrics family (`APP12-H03` §6).
 *
 * `safeRoute` (APP0-B05) is the *logging* projection and accepts a documented
 * limitation: when the framework exposed no route template it falls back to the
 * concrete pathname, which may contain an id. That limitation is acceptable for
 * a log line, which is a bounded record read by a human during an incident.
 *
 * It is **not** acceptable for a metric label. A concrete pathname carries an
 * order id, and an order id as a label is an unbounded time series and an
 * identifier stored forever in the monitoring plane — the two failures §5
 * exists to prevent. So this projection is strictly stronger than the logging
 * one: **template or nothing.** A request that matched no route contributes
 * `other`, and the information that would have distinguished it stays in the
 * log record, where §12 puts high-cardinality correlation.
 */
import type { RoutableRequest } from '../logging/safe-route';

/** The single bucket for every request that matched no route template. */
export const UNMATCHED_ROUTE = 'other';

/** Longest template retained; a longer one is folded into `other`. */
const MAX_TEMPLATE_LENGTH = 60;

/** Characters a route template may contain and still be a safe label value. */
const TEMPLATE_PATTERN = /^[A-Za-z0-9_.:/-]+$/;

/**
 * Operational paths excluded from the business request view (§6).
 *
 * Probe traffic is constant, uninteresting and — in a system doing fewer than a
 * hundred orders a month — would be the overwhelming majority of the series,
 * hiding the request rate the dashboard exists to show. They are excluded here
 * rather than filtered in PromQL so the exclusion is a property of the data and
 * cannot be forgotten by a panel.
 */
const EXCLUDED_TEMPLATES = ['/api/health', '/api/health/readiness'] as const;

function joinPath(base: string, path: string): string {
  if (base === '') {
    return path;
  }
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/** The route template, or `other`. Never a concrete path. */
export function metricRouteTemplate(request: RoutableRequest): string {
  const template = request.route?.path;
  if (typeof template !== 'string' || template.length === 0) {
    return UNMATCHED_ROUTE;
  }
  const base = typeof request.baseUrl === 'string' ? request.baseUrl : '';
  const joined = joinPath(base, template);
  if (joined.length > MAX_TEMPLATE_LENGTH || !TEMPLATE_PATTERN.test(joined)) {
    return UNMATCHED_ROUTE;
  }
  return joined;
}

/** `true` when this request must not appear in the business request view. */
export function isExcludedFromHttpMetrics(routeTemplate: string): boolean {
  return (EXCLUDED_TEMPLATES as readonly string[]).includes(routeTemplate);
}

/** The method, upper-cased and bounded to the known verbs. */
const KNOWN_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT',
] as const;

export function metricMethod(request: RoutableRequest): string {
  const method = typeof request.method === 'string' ? request.method.toUpperCase() : '';
  return (KNOWN_METHODS as readonly string[]).includes(method) ? method : 'other';
}
