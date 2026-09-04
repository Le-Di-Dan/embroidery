/**
 * The scrape-time collector (`APP12-H03` §8, §9, §23).
 *
 * Registered with the registry, so it runs once per scrape, under the
 * registry's shared deadline, and its failure is counted rather than allowed to
 * blank the whole scrape — an operator whose database is unreachable needs the
 * job and notification counters *more* than usual, not less.
 *
 * Two gauges and nothing else. Every other worker metric is incremented by the
 * code that does the work, which is both cheaper and more truthful; these two
 * are properties of the database rather than of anything this process did, so
 * there is no such moment to increment them at.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { MetricCollector } from '@embroidery/observability';

import { WorkerRuntimeMetrics } from './worker-metrics.providers';
import { TelemetrySnapshotRepository } from './telemetry-snapshot.repository';

/** The invariant name carried by `embroidery_invariant_violations`. */
export const EXPIRED_RESERVATION_HELD = 'expired_reservation_held';

@Injectable()
export class TelemetrySnapshotCollector implements MetricCollector {
  readonly name = 'telemetry_snapshot';
  private readonly logger = new Logger(TelemetrySnapshotCollector.name);

  constructor(
    private readonly snapshots: TelemetrySnapshotRepository,
    private readonly metrics: WorkerRuntimeMetrics,
  ) {}

  async collect(): Promise<void> {
    const now = new Date();
    try {
      const backlog = await this.snapshots.queueBacklog(now);
      this.metrics.setQueueBacklog(backlog.pending, backlog.oldestPendingAgeSeconds);
      this.metrics.setInvariant(
        EXPIRED_RESERVATION_HELD,
        await this.snapshots.expiredReservationsStillHeld(now),
      );
    } catch (error: unknown) {
      // The message only. A driver error can carry a connection string, and the
      // gauge is a number — there is nothing about this failure that belongs in
      // the scrape body itself, which is why the registry counts it under the
      // collector's *name* rather than its reason.
      this.logger.warn(
        `Telemetry snapshot failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      this.metrics.recordDependencyError('database', 'telemetry.snapshot');
      throw error instanceof Error ? error : new Error('telemetry snapshot failed');
    }
  }
}
