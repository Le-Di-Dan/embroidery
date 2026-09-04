/**
 * The schedule the Ready-Made reservation-expiry sweep runs on (`BR-026`).
 *
 * A verbatim copy of `IntakeCleanupRuntimeService`'s structure, and deliberately
 * so — both of its decisions were learned rather than chosen:
 *
 * - **one sequential loop, never `setInterval`.** An interval overlaps whenever
 *   a pass outlasts it, and two overlapping passes would contend on the same
 *   `orders` and `sku_stocks` rows;
 * - **the sleep is abortable.** Shutdown must stop the loop within a signal
 *   handler's budget, not at the end of a full interval.
 *
 * A failed pass is logged and the loop continues. There is no retry curve and
 * no dead-letter: the next pass re-reads the same rows from the database, so
 * "retry" and "run again in a minute" are the same thing here.
 *
 * The first pass waits one interval rather than running at boot, so a worker in
 * a crash loop does not sweep on every restart.
 */
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { WORKER_CLOCK, type WorkerClock } from '../../runtime/clock/worker-clock';
import { WorkerRuntimeMetrics } from '../../runtime/metrics/worker-metrics.providers';
import { ExpireReadyMadeReservationsUseCase } from './application/expire-reservations.usecase';
import { RESERVATION_EXPIRY_INTERVAL_MS } from './domain/reservation-expiry.policy';

@Injectable()
export class ReservationExpiryRuntimeService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReservationExpiryRuntimeService.name);
  private readonly shutdown = new AbortController();
  private loop: Promise<void> | undefined;
  private started = false;

  constructor(
    private readonly expiry: ExpireReadyMadeReservationsUseCase,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
    private readonly metrics: WorkerRuntimeMetrics,
  ) {}

  onApplicationBootstrap(): void {
    this.started = true;
    this.loop = this.sweepForever();
    this.logger.log(
      `Ready-Made reservation expiry started; one pass every ` +
        `${String(RESERVATION_EXPIRY_INTERVAL_MS)}ms.`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.shutdown.abort();
    // Awaited, so an in-flight pass finishes the candidate it is holding locks
    // for rather than being cut between the reservation write and the order's.
    await this.loop;
  }

  private async sweepForever(): Promise<void> {
    while (!this.shutdown.signal.aborted) {
      await this.clock.sleep(RESERVATION_EXPIRY_INTERVAL_MS, this.shutdown.signal);
      if (this.shutdown.signal.aborted) {
        return;
      }
      try {
        const outcome = await this.expiry.run();
        // `APP12-H03` §7 — the pass result, recorded after the pass returns.
        // Per-reservation expiries are counted too, so "are reservations being
        // released" is answerable without reading the database.
        this.metrics.recordReservationSweep({
          outcome: 'success',
          examined: outcome.examined,
          expired: outcome.expired,
        });
        if (outcome.expired > 0) {
          this.metrics.recordReservation({
            transition: 'expire',
            outcome: 'success',
            reasonClass: 'other',
            count: outcome.expired,
          });
        }
      } catch (error: unknown) {
        // A failed pass is a system error, never a refusal: the sweep has no
        // business rule to decline under, so anything reaching here is a fault
        // an operator must act on (§15's reservation-processing alert).
        this.metrics.recordReservationSweep({ outcome: 'system_error', examined: 0, expired: 0 });
        // The message only: an error object from the database can carry a
        // connection string or a row's values.
        this.logger.error(
          `Ready-Made reservation expiry pass failed: ` +
            `${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}
