/**
 * The worker metrics platform (`APP12-H03` §8, §10).
 *
 * Global, so the execution boundary, the notification handler and the expiry
 * sweep all reach the same recorder without their modules importing anything.
 *
 * The collector is registered with the registry here, in `onModuleInit`, rather
 * than at construction: a provider's constructor must not depend on another
 * provider having been built, and registering from a lifecycle hook makes the
 * ordering explicit. It runs long before the first scrape, and long before the
 * poll loop starts in `onApplicationBootstrap`.
 */
import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { TelemetrySnapshotCollector } from './telemetry-snapshot.collector';
import { TelemetrySnapshotRepository } from './telemetry-snapshot.repository';
import {
  WORKER_METRIC_REGISTRY,
  WorkerRuntimeMetrics,
  createWorkerMetricRegistry,
} from './worker-metrics.providers';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: WORKER_METRIC_REGISTRY, useFactory: createWorkerMetricRegistry },
    WorkerRuntimeMetrics,
    TelemetrySnapshotRepository,
    TelemetrySnapshotCollector,
  ],
  exports: [WORKER_METRIC_REGISTRY, WorkerRuntimeMetrics],
})
export class WorkerMetricsModule implements OnModuleInit {
  constructor(
    private readonly metrics: WorkerRuntimeMetrics,
    private readonly collector: TelemetrySnapshotCollector,
  ) {}

  onModuleInit(): void {
    this.metrics.registry.registerCollector(this.collector);
  }
}
