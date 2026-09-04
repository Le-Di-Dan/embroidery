/**
 * The worker's injectable view of the shared metrics platform
 * (`APP12-H03` §8, §9, §10).
 *
 * The same seam the API has, for the same reason: one registry per process, and
 * a recorder a collaborator receives through its constructor. The instruments
 * and the cardinality contract are the shared package's; nothing is redefined
 * here, so a `job_type` label means the same thing in both processes and a
 * dashboard can compare them.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  MetricRegistry,
  createDependencyMetrics,
  createWorkerMetrics,
  type DependencyMetrics,
  type JobAttemptObservation,
  type MetricDependency,
  type NotificationObservation,
  type ReservationObservation,
  type SweepObservation,
  type WorkerMetrics,
} from '@embroidery/observability';

/** DI token for the process-wide registry. */
export const WORKER_METRIC_REGISTRY = Symbol('WORKER_METRIC_REGISTRY');

export function createWorkerMetricRegistry(): MetricRegistry {
  return new MetricRegistry('worker');
}

@Injectable()
export class WorkerRuntimeMetrics {
  private readonly metrics: WorkerMetrics;
  private readonly dependencies: DependencyMetrics;

  constructor(@Inject(WORKER_METRIC_REGISTRY) readonly registry: MetricRegistry) {
    this.metrics = createWorkerMetrics(registry);
    this.dependencies = createDependencyMetrics(registry);
  }

  recordJobClaimed(jobType: string): void {
    this.metrics.recordJobClaimed(jobType);
  }

  recordJobAttempt(observation: JobAttemptObservation): void {
    this.metrics.recordJobAttempt(observation);
  }

  recordNotification(observation: NotificationObservation): void {
    this.metrics.recordNotification(observation);
  }

  recordReservationSweep(observation: SweepObservation): void {
    this.metrics.recordReservationSweep(observation);
  }

  recordReservation(observation: ReservationObservation): void {
    this.metrics.recordReservation(observation);
  }

  setQueueBacklog(pending: number, oldestPendingAgeSeconds: number): void {
    this.metrics.setQueueBacklog(pending, oldestPendingAgeSeconds);
  }

  setInvariant(invariant: string, value: number): void {
    this.metrics.setInvariant(invariant, value);
  }

  recordDependencyError(dependency: MetricDependency, operation: string): void {
    this.dependencies.recordDependencyError(dependency, operation);
  }
}
