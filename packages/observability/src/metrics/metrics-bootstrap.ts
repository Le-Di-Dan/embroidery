/**
 * Starting the internal metrics listener from process bootstrap
 * (`APP12-H03` §10, §19).
 *
 * Deliberately not a Nest lifecycle hook. The API's `createApiApplication()` is
 * reused by the OpenAPI generator and by every integration-test application, and
 * a lifecycle hook would make all of them bind a port — turning a parallel test
 * run into a port-collision failure and, worse, making the OpenAPI generator
 * open a socket. Only a runtime entry point starts it, and both applications
 * start it the same way.
 *
 * **A failure to bind never stops the application.** §19 requires that
 * production startup does not depend on the monitoring plane; the mirror of
 * that rule is that the application's own telemetry surface is not a startup
 * precondition either. An API that serves customers with no metrics is a
 * degraded system; an API that refuses to serve customers because a metrics
 * port was taken is an outage this checkpoint would have caused.
 */
import type { MetricRegistry } from './metric-registry';
import {
  resolveMetricsEnabled,
  resolveMetricsPort,
  startMetricsListener,
  type MetricsListener,
} from './metrics-listener';

export interface MetricsBootstrapResult {
  readonly listener: MetricsListener | undefined;
  readonly status: 'listening' | 'disabled' | 'failed';
  readonly port: number | undefined;
}

export interface MetricsBootstrapOptions {
  readonly registry: MetricRegistry;
  readonly env: NodeJS.ProcessEnv;
  readonly onError: (error: unknown) => void;
}

/** Starts the listener, reporting rather than throwing on every failure. */
export async function bootstrapMetricsListener(
  options: MetricsBootstrapOptions,
): Promise<MetricsBootstrapResult> {
  if (!resolveMetricsEnabled(options.env['METRICS_ENABLED'])) {
    return { listener: undefined, status: 'disabled', port: undefined };
  }
  const port = resolveMetricsPort(options.env['METRICS_PORT']);
  try {
    const listener = await startMetricsListener({
      registry: options.registry,
      port,
      onError: options.onError,
    });
    return { listener, status: 'listening', port: listener.port };
  } catch (error: unknown) {
    options.onError(error);
    return { listener: undefined, status: 'failed', port };
  }
}
