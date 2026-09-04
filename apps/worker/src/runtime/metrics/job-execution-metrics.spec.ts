/**
 * Exact-count instrumentation at the worker execution boundary
 * (`APP12-H03` §22, §26.10, §26.36).
 *
 * §22 asks for counts, not for "a metric exists": one success increments
 * exactly one success, a retry is counted as an execution without the job id
 * becoming a label, and a failure never lands in the success series. Each test
 * below asserts against the **rendered scrape** — the same text a Prometheus
 * server reads — rather than against an internal counter, so a bug in the
 * exposition would fail here too.
 */
import { MetricRegistry, renderMetrics } from '@embroidery/observability';
import type { TransactionManager, WorkerJobQueueRepository } from '@embroidery/persistence';

import { systemWorkerClock } from '../clock/worker-clock';
import { WorkerJobError } from '../errors/worker-job-error';
import { JobExecutionService } from '../execution/job-execution.service';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import {
  FakeQueue,
  FakeTransactions,
  FakeWorkerProcess,
  TEST_POLICY,
  claimedJob,
  fatalServiceWith,
  testHandler,
} from '../tests/runtime-doubles';
import { WorkerRuntimeMetrics } from './worker-metrics.providers';

const WORKER_ID = 'worker:test:1:uuid';

interface Harness {
  readonly registry: JobHandlerRegistry;
  readonly queue: FakeQueue;
  readonly metrics: WorkerRuntimeMetrics;
  readonly service: JobExecutionService;
  readonly scrape: () => Promise<string>;
}

function harness(): Harness {
  const registry = new JobHandlerRegistry();
  const queue = new FakeQueue();
  const metricRegistry = new MetricRegistry('worker');
  const metrics = new WorkerRuntimeMetrics(metricRegistry);
  const service = new JobExecutionService(
    registry,
    queue as unknown as WorkerJobQueueRepository,
    new FakeTransactions() as unknown as TransactionManager,
    fatalServiceWith(new FakeWorkerProcess()).fatal,
    systemWorkerClock,
    metrics,
  );
  return { registry, queue, metrics, service, scrape: () => renderMetrics(metricRegistry) };
}

/** Reads one series' value out of a rendered scrape; `0` when absent. */
function seriesValue(body: string, line: string): number {
  const match = body.split('\n').find((candidate) => candidate.startsWith(line));
  if (match === undefined) {
    return 0;
  }
  return Number(match.slice(line.length).trim());
}

describe('worker job metrics', () => {
  it('counts exactly one claim and one succeeded attempt for one successful job', async () => {
    const { registry, service, scrape } = harness();
    registry.register(testHandler());

    await service.run(claimedJob(), TEST_POLICY, WORKER_ID);
    const body = await scrape();

    expect(
      seriesValue(body, 'embroidery_worker_job_claimed_total{service="worker",job_type="OUTBOX_DISPATCH"}'),
    ).toBe(1);
    expect(
      seriesValue(
        body,
        'embroidery_worker_job_attempts_total{service="worker",job_type="OUTBOX_DISPATCH",outcome="succeeded"}',
      ),
    ).toBe(1);
    expect(
      seriesValue(
        body,
        'embroidery_worker_job_duration_seconds_count{service="worker",job_type="OUTBOX_DISPATCH",outcome="succeeded"}',
      ),
    ).toBe(1);
  });

  it('never records a success for a failed attempt', async () => {
    const { registry, service, scrape } = harness();
    registry.register(
      testHandler({
        execute: () => Promise.reject(new WorkerJobError('JOB_TRANSIENT_FAILURE', 'temporary')),
      }),
    );

    await service.run(claimedJob(), TEST_POLICY, WORKER_ID);
    const body = await scrape();

    expect(
      seriesValue(
        body,
        'embroidery_worker_job_attempts_total{service="worker",job_type="OUTBOX_DISPATCH",outcome="succeeded"}',
      ),
    ).toBe(0);
    expect(
      seriesValue(
        body,
        'embroidery_worker_job_attempts_total{service="worker",job_type="OUTBOX_DISPATCH",outcome="failed_retryable"}',
      ),
    ).toBe(1);
  });

  it('counts a retry as an execution and as a retry, and never as a job id', async () => {
    const { registry, service, scrape } = harness();
    registry.register(testHandler());

    const job = claimedJob({ attemptNo: 3 });
    await service.run(job, TEST_POLICY, WORKER_ID);
    const body = await scrape();

    expect(
      seriesValue(body, 'embroidery_worker_job_retries_total{service="worker",job_type="OUTBOX_DISPATCH"}'),
    ).toBe(1);
    expect(
      seriesValue(
        body,
        'embroidery_worker_job_attempts_total{service="worker",job_type="OUTBOX_DISPATCH",outcome="succeeded"}',
      ),
    ).toBe(1);
    // The attempt number and the outbox event id are log fields, never labels.
    // Asserted against the label *values* only: `..._job_attempts_total` is a
    // metric name that legitimately contains the word "attempt", and matching
    // the whole body would flag it.
    const labelValues = [...body.matchAll(/="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(labelValues).not.toContain(String(job.attemptNo));
    expect(labelValues).not.toContain(job.outboxEventId.toString());
    expect(body).not.toContain('attempt_no');
  });

  it('does not count a first attempt as a retry', async () => {
    const { registry, service, scrape } = harness();
    registry.register(testHandler());

    await service.run(claimedJob({ attemptNo: 1 }), TEST_POLICY, WORKER_ID);
    const body = await scrape();

    expect(
      seriesValue(body, 'embroidery_worker_job_retries_total{service="worker",job_type="OUTBOX_DISPATCH"}'),
    ).toBe(0);
  });

  it('abandons an unregistered event type under a bounded job type, not the event name', async () => {
    const { service, scrape } = harness();

    const summary = await service.run(
      claimedJob({ eventType: 'some.unregistered.event' }),
      TEST_POLICY,
      WORKER_ID,
    );
    const body = await scrape();

    expect(summary.outcome).toBe('ABANDONED');
    expect(
      seriesValue(
        body,
        'embroidery_worker_job_attempts_total{service="worker",job_type="UNKNOWN_JOB_TYPE",outcome="abandoned"}',
      ),
    ).toBe(1);
    // The claimed event type is an open vocabulary and must never be a label.
    expect(body).not.toContain('some.unregistered.event');
  });

  it('drops no series across the whole suite of job kinds', async () => {
    const { registry, service, metrics, scrape } = harness();
    registry.register(testHandler());
    await service.run(claimedJob(), TEST_POLICY, WORKER_ID);
    await scrape();

    expect(metrics.registry.droppedSeries()).toBe(0);
  });
});
