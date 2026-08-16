/**
 * The schedule the APP5 intake sweep runs on (`APP5-B02` §7.3).
 *
 * The worker's existing runtime is outbox-driven: `JobPollRuntimeService`
 * claims events by registered type, and there is nothing to register here —
 * expiry produces no event, which is the whole reason a sweep is needed. So
 * this is a second, much smaller loop rather than a handler.
 *
 * It copies the poll runtime's two structural decisions verbatim, because both
 * were learned rather than chosen:
 *
 * - **one sequential loop, never `setInterval`.** An interval overlaps whenever
 *   a pass outlasts it, and a pass that deletes a hundred objects across a slow
 *   network routinely will. Two overlapping passes would each try to delete the
 *   other's binaries;
 * - **the sleep is abortable.** Shutdown must stop the loop within a signal
 *   handler's budget, not at the end of a five-minute wait.
 *
 * A failed pass is logged and the loop continues. There is no retry curve and
 * no dead-letter: the next pass re-reads the same rows from the database, so
 * "retry" and "run again in five minutes" are the same thing here, and adding a
 * second failure-handling vocabulary for one sweep would be a general retention
 * platform — which §7.3 rules out.
 */
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { WORKER_CLOCK, type WorkerClock } from '../../runtime/clock/worker-clock';
import { IntakeCleanupUseCase } from './application/intake-cleanup.usecase';
import { INTAKE_CLEANUP_INTERVAL_MS } from './domain/intake-cleanup.policy';

@Injectable()
export class IntakeCleanupRuntimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IntakeCleanupRuntimeService.name);
  private readonly shutdown = new AbortController();
  private loop: Promise<void> | undefined;
  private started = false;

  constructor(
    private readonly cleanup: IntakeCleanupUseCase,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
  ) {}

  onApplicationBootstrap(): void {
    this.started = true;
    this.loop = this.sweepForever();
    this.logger.log(
      `APP5 intake cleanup started; one pass every ${String(INTAKE_CLEANUP_INTERVAL_MS)}ms.`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.shutdown.abort();
    // Awaited, so an in-flight pass finishes its current object rather than
    // being cut between the store deletion and the row that records it.
    await this.loop;
  }

  private async sweepForever(): Promise<void> {
    // The first pass waits one interval rather than running at boot: a worker
    // restarting in a crash loop would otherwise sweep on every restart, and
    // nothing about an expired upload is urgent enough to justify that.
    while (!this.shutdown.signal.aborted) {
      await this.sleep(INTAKE_CLEANUP_INTERVAL_MS);
      if (this.shutdown.signal.aborted) {
        return;
      }
      try {
        await this.cleanup.run();
      } catch (error: unknown) {
        // The message only: an error object from the database or the object
        // store can carry a key, a bucket or a connection string.
        this.logger.error(
          `APP5 intake cleanup pass failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return this.clock.sleep(ms, this.shutdown.signal);
  }
}
