/**
 * Generic transport and dependency metrics (`APP12-H03` §6, §9).
 *
 * HTTP is instrumented once, at one shared boundary, and the route dimension is
 * a **route template** — `/api/orders/:orderId`, never the concrete path. That
 * distinction is the whole reason this family is safe: a concrete path carries
 * an order id, which is unbounded and identifying, and putting it in a label
 * would breach §5 twice over. A request that matched no route contributes
 * `other` rather than its raw path.
 *
 * Health, readiness and the metrics listener itself are excluded by the caller,
 * so probe traffic — which is constant, uninteresting, and would be most of the
 * volume in a low-traffic system — cannot drown the business request view (§6).
 */
import type { MetricRegistry } from '../metrics/metric-registry';
import type { MetricDependency } from './metric-vocabulary';

export interface HttpObservation {
  readonly method: string;
  readonly routeTemplate: string;
  readonly statusClass: string;
  readonly durationSeconds: number;
}

export interface HttpMetrics {
  requestStarted(): void;
  requestCompleted(observation: HttpObservation): void;
  /**
   * Releases the in-flight gauge for a request that is deliberately **not**
   * counted — a health probe, or a connection that closed before the response
   * finished.
   *
   * It increments no counter and observes no duration, and that is the whole
   * point. An earlier version routed these through `requestCompleted` with
   * `route_template="other"`, and the result was a staging API whose request
   * panel was 89 probe requests and nothing else: the exclusion §6 asks for
   * only works if the excluded request leaves no trace in the business family.
   */
  requestExcluded(): void;
}

export function createHttpMetrics(registry: MetricRegistry): HttpMetrics {
  const total = registry.counter({
    name: 'embroidery_http_requests_total',
    help: 'HTTP requests completed, by method, route template and status class.',
    labelNames: ['method', 'route_template', 'status_class'],
  });
  const duration = registry.histogram({
    name: 'embroidery_http_request_duration_seconds',
    help: 'HTTP request duration, by method, route template and status class.',
    labelNames: ['method', 'route_template', 'status_class'],
  });
  const inFlight = registry.gauge({
    name: 'embroidery_http_requests_in_flight',
    help: 'HTTP requests currently being served.',
    labelNames: [],
  });

  return {
    requestStarted() {
      inFlight.add({}, 1);
    },
    requestExcluded() {
      inFlight.add({}, -1);
    },
    requestCompleted(observation) {
      inFlight.add({}, -1);
      const labels = {
        method: observation.method,
        route_template: observation.routeTemplate,
        status_class: observation.statusClass,
      };
      total.inc(labels);
      duration.observe(labels, observation.durationSeconds);
    },
  };
}

export interface DependencyMetrics {
  recordDependencyError(dependency: MetricDependency, operation: string): void;
}

/**
 * System errors raised by an infrastructure dependency, counted at the
 * application boundary that called it (§9).
 *
 * `operation` is the application's own name for the call — `order.create`,
 * `evidence.put` — never a SQL statement and never a bucket key. §9 forbids
 * labelling by SQL, and a query string is exactly where a customer's search
 * term or an order code would arrive.
 */
export function createDependencyMetrics(registry: MetricRegistry): DependencyMetrics {
  const errors = registry.counter({
    name: 'embroidery_dependency_errors_total',
    help: 'Infrastructure dependency failures observed at an application boundary.',
    labelNames: ['dependency', 'operation'],
  });
  return {
    recordDependencyError(dependency, operation) {
      errors.inc({ dependency, operation });
    },
  };
}
