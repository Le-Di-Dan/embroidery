/**
 * Worker execution, notification delivery and invariant metrics
 * (`APP12-H03` §8, §9).
 *
 * Instrumented at the *shared* execution boundary rather than per handler, so a
 * job kind added by a later checkpoint is observable the moment it is
 * registered and nobody has to remember to instrument it. `job_type` is
 * `BackgroundJobKind` — ten closed values — and `outcome` mirrors the runtime's
 * own `AttemptSummary.outcome`; neither the outbox event id, the attempt number
 * nor the correlation id appears as a label, because each of them is unbounded
 * by construction. They stay log fields, which is where §12 puts them.
 */
import { RESERVATION_TOTAL, type ReservationObservation } from './commerce-metrics';
import type { MetricRegistry } from '../metrics/metric-registry';
import type {
  MetricJobOutcome,
  MetricNotificationOperation,
  MetricOutcome,
} from './metric-vocabulary';

export interface JobAttemptObservation {
  readonly jobType: string;
  readonly outcome: MetricJobOutcome;
  readonly durationSeconds: number;
  /** `true` when this attempt was itself a retry of an earlier one. */
  readonly retry: boolean;
}

export interface NotificationObservation {
  readonly operation: MetricNotificationOperation;
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
}

export interface SweepObservation {
  readonly outcome: MetricOutcome;
  readonly examined: number;
  readonly expired: number;
}

export interface WorkerMetrics {
  recordJobClaimed(jobType: string): void;
  recordJobAttempt(observation: JobAttemptObservation): void;
  recordNotification(observation: NotificationObservation): void;
  recordReservationSweep(observation: SweepObservation): void;
  /** The worker owns exactly one reservation transition: `expire`. */
  recordReservation(observation: ReservationObservation): void;
  setQueueBacklog(pending: number, oldestPendingAgeSeconds: number): void;
  setInvariant(invariant: string, value: number): void;
}

export function createWorkerMetrics(registry: MetricRegistry): WorkerMetrics {
  const claimed = registry.counter({
    name: 'embroidery_worker_job_claimed_total',
    help: 'Jobs claimed from the queue.',
    labelNames: ['job_type'],
  });
  const attempts = registry.counter({
    name: 'embroidery_worker_job_attempts_total',
    help: 'Completed job attempts by kind and outcome.',
    labelNames: ['job_type', 'outcome'],
  });
  const retries = registry.counter({
    name: 'embroidery_worker_job_retries_total',
    help: 'Attempts that were themselves retries of an earlier attempt.',
    labelNames: ['job_type'],
  });
  const duration = registry.histogram({
    name: 'embroidery_worker_job_duration_seconds',
    help: 'Job attempt duration.',
    labelNames: ['job_type', 'outcome'],
  });
  const notifications = registry.counter({
    name: 'embroidery_notification_delivery_total',
    help: 'Notification deliveries by purpose and outcome.',
    labelNames: ['operation', 'outcome', 'reason_class'],
  });
  const sweeps = registry.counter({
    name: 'embroidery_reservation_sweep_total',
    help: 'Ready-Made reservation expiry sweep passes by outcome.',
    labelNames: ['outcome'],
  });
  const sweptExpired = registry.counter({
    name: 'embroidery_reservation_sweep_expired_total',
    help: 'Reservations expired by the sweep.',
    labelNames: [],
  });
  const sweptExamined = registry.counter({
    name: 'embroidery_reservation_sweep_examined_total',
    help: 'Reservation candidates examined by the sweep.',
    labelNames: [],
  });
  // Backlog gauges. `job_type` is deliberately absent: a grouped backlog query
  // is a second index this checkpoint may not add (§8), and the ungrouped one
  // is answerable from the queue's existing due-work index.
  const pending = registry.gauge({
    name: 'embroidery_worker_queue_pending',
    help: 'Jobs due for execution at the last scrape.',
    labelNames: [],
  });
  const oldestPending = registry.gauge({
    name: 'embroidery_worker_queue_oldest_pending_age_seconds',
    help: 'Age of the oldest due job at the last scrape.',
    labelNames: [],
  });
  const reservations = registry.counter(RESERVATION_TOTAL);
  const invariants = registry.gauge({
    name: 'embroidery_invariant_violations',
    help: 'Rows violating an operational invariant at the last scrape.',
    labelNames: ['invariant'],
  });

  return {
    recordJobClaimed(jobType) {
      claimed.inc({ job_type: jobType });
    },
    recordJobAttempt(observation) {
      attempts.inc({ job_type: observation.jobType, outcome: observation.outcome });
      duration.observe(
        { job_type: observation.jobType, outcome: observation.outcome },
        observation.durationSeconds,
      );
      if (observation.retry) {
        retries.inc({ job_type: observation.jobType });
      }
    },
    recordNotification(observation) {
      notifications.inc({
        operation: observation.operation,
        outcome: observation.outcome,
        reason_class: observation.reasonClass,
      });
    },
    recordReservation(observation) {
      reservations.inc(
        {
          transition: observation.transition,
          outcome: observation.outcome,
          reason_class: observation.reasonClass,
        },
        observation.count ?? 1,
      );
    },
    recordReservationSweep(observation) {
      sweeps.inc({ outcome: observation.outcome });
      sweptExamined.inc({}, observation.examined);
      sweptExpired.inc({}, observation.expired);
    },
    setQueueBacklog(pendingCount, oldestPendingAgeSeconds) {
      pending.set({}, pendingCount);
      oldestPending.set({}, oldestPendingAgeSeconds);
    },
    setInvariant(invariant, value) {
      invariants.set({ invariant }, value);
    },
  };
}
