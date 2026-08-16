import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetInspectionModule } from '../jobs/asset-inspection/asset-inspection.module';
import { IntakeCleanupModule } from '../jobs/app5-intake-cleanup/intake-cleanup.module';
import { AssetNormalizationModule } from '../jobs/asset-normalization/asset-normalization.module';
import { NotificationDeliveryModule } from '../jobs/notification-delivery/notification-delivery.module';
import { WorkerRuntimeModule } from '../runtime/worker-runtime.module';
import { WorkerObjectStorageModule } from '../storage/object-storage.module';

/**
 * The worker uses the same persistence runtime as the API (DEC-DB7-003), with
 * its own pool: the two processes are deployed and scaled independently, so
 * sharing a pool object across them is not possible and sharing pool *sizing*
 * would be wrong.
 *
 * The no-op keep-alive service that used to live here is gone (APP2-I02): the
 * queue decision has landed (IMP-D029 / ADR-APP2-002), and the poll runtime
 * plus the connection pool now hold the event loop open for a real reason.
 */
@Module({
  // The storage module is listed **before** the runtime: it binds
  // `WORKER_STARTUP_GATE`, which the poll runtime injects, and it is the reason
  // the worker verifies its private buckets before claiming anything
  // (APP2-I03).
  // The two capabilities are last: each registers its handler in
  // `onModuleInit` — before any `onApplicationBootstrap`, so the registry is
  // populated before the poll loop issues its first claim (APP2-W01 §19).
  // `AssetNormalizationModule` (APP3-W01A) is a second capability on the same
  // runtime, not a second runtime: the registry refuses two handlers for one
  // event type, and its claim filter is exactly the registered types.
  imports: [
    DatabaseModule,
    WorkerObjectStorageModule,
    WorkerRuntimeModule,
    AssetInspectionModule,
    AssetNormalizationModule,
    // `NotificationDeliveryModule` (APP4-W01) is the third capability on the
    // same runtime. It needs no object storage and reads its own published
    // `notification.delivery` policy; a worker with no such policy simply never
    // sends, which is the fail-closed state that keeps a secret undelivered
    // rather than dead-lettered.
    NotificationDeliveryModule,
    // `IntakeCleanupModule` (APP5-B02) is the first capability here that is
    // **not** an outbox handler: an expired, unbound customer upload produces
    // no event to claim, which is precisely why it needs a sweep. It shares the
    // clock and the storage client but registers nothing with the handler
    // registry, so it cannot affect what the poll loop claims.
    IntakeCleanupModule,
  ],
})
export class WorkerModule {}
