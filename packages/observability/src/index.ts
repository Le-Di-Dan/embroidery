/**
 * `@embroidery/observability` — the shared operational telemetry primitives
 * (`APP12-H03`).
 *
 * The package boundary was approved at CP0 and left empty because the
 * observability *tooling* was an open decision. `ADR-APP12-001` closes it:
 * Prometheus is the metrics protocol, Loki the log store, Grafana the
 * dashboard, Alertmanager the notifier. What lives here is the part that is
 * shared by `@embroidery/api` and `@embroidery/worker` and must behave
 * identically in both — the cardinality contract, the instruments, the
 * registry, the exposition format and the internal listener.
 *
 * No vendor SDK is imported. The README's standing boundary is unchanged: the
 * dependency list of this package is empty, and everything below is Node
 * builtins and plain TypeScript. That is not purism — it is what allows
 * `metric-label.ts` to be the *only* path a label can take to a scrape.
 *
 * Unlike the CP0 stub, this package now builds to `dist` and is loaded at
 * runtime by both applications, so it follows the `IMP-D018` rule the API's
 * logging module recorded: `main` resolves to compiled JavaScript, never to
 * raw source.
 */
export {
  ALLOWED_METRIC_LABEL_NAMES,
  FORBIDDEN_METRIC_LABEL_NAMES,
  MAX_METRIC_LABEL_VALUE_LENGTH,
  METRIC_NAME_PREFIX,
  MetricContractError,
  assertLabelNames,
  assertLabelValue,
  assertMetricName,
  isForbiddenLabelName,
  type MetricLabelName,
} from './metrics/metric-label';

export {
  MAX_SERIES_PER_METRIC,
  type MetricLabels,
  type MetricSeries,
} from './metrics/metric-series';

export {
  Counter,
  DEFAULT_DURATION_BUCKETS,
  Gauge,
  Histogram,
  type AnyInstrument,
  type HistogramDefinition,
  type MetricDefinition,
  type MetricType,
} from './metrics/metric-instruments';

export {
  COLLECTOR_TIMEOUT_MS,
  MetricRegistry,
  type MetricCollector,
  type ServiceName,
} from './metrics/metric-registry';

export { METRICS_CONTENT_TYPE, renderMetrics } from './metrics/exposition';

export {
  bootstrapMetricsListener,
  type MetricsBootstrapOptions,
  type MetricsBootstrapResult,
} from './metrics/metrics-bootstrap';

export {
  DEFAULT_METRICS_PORT,
  METRICS_PATH,
  resolveMetricsEnabled,
  resolveMetricsPort,
  startMetricsListener,
  type MetricsListener,
  type MetricsListenerOptions,
} from './metrics/metrics-listener';

export {
  METRIC_DEPENDENCIES,
  METRIC_FULFILMENT_TRANSITIONS,
  METRIC_JOB_OUTCOMES,
  METRIC_NOTIFICATION_OPERATIONS,
  METRIC_ORIGINS,
  METRIC_OUTCOMES,
  METRIC_PAYMENT_KINDS,
  METRIC_RESERVATION_TRANSITIONS,
  METRIC_STATUS_CLASSES,
  UNCLASSIFIED_REASON,
  reasonClass,
  statusClass,
  type MetricDependency,
  type MetricFulfilmentTransition,
  type MetricJobOutcome,
  type MetricNotificationOperation,
  type MetricOutcome,
  type MetricReservationTransition,
} from './catalog/metric-vocabulary';

export {
  createCommerceMetrics,
  type CommerceMetrics,
  type FulfilmentObservation,
  type OrderCreateObservation,
  type PaymentVerificationObservation,
  type ReservationObservation,
} from './catalog/commerce-metrics';

export {
  createDependencyMetrics,
  createHttpMetrics,
  type DependencyMetrics,
  type HttpMetrics,
  type HttpObservation,
} from './catalog/platform-metrics';

export {
  createWorkerMetrics,
  type JobAttemptObservation,
  type NotificationObservation,
  type SweepObservation,
  type WorkerMetrics,
} from './catalog/worker-metrics';
