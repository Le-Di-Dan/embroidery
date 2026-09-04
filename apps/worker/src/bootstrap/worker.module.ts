import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetInspectionModule } from '../jobs/asset-inspection/asset-inspection.module';
import { IntakeCleanupModule } from '../jobs/app5-intake-cleanup/intake-cleanup.module';
import { ReadyMadeReservationExpiryModule } from '../jobs/ready-made-reservation-expiry/reservation-expiry.module';
import { AssetNormalizationModule } from '../jobs/asset-normalization/asset-normalization.module';
import { InventoryReservationModule } from '../jobs/inventory-reservation/inventory-reservation.module';
import { NotificationDeliveryModule } from '../jobs/notification-delivery/notification-delivery.module';
import { OrderConversionModule } from '../jobs/order-conversion/order-conversion.module';
import { OrderCreatedAcknowledgementModule } from '../jobs/order-created-acknowledgement/order-created-acknowledgement.module';
import { WorkerMetricsModule } from '../runtime/metrics/worker-metrics.module';
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
    // `APP12-H03` — the metrics platform. Global and before the runtime, which
    // injects `WorkerRuntimeMetrics` at the execution boundary. It registers no
    // handler, claims nothing and starts no loop; the scrape is served by an
    // internal listener `main.ts` starts.
    WorkerMetricsModule,
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
    // `OrderConversionModule` (APP7-W01) is the fourth outbox capability, and
    // the consumer `design.approved` has been waiting for since APP6-B11: every
    // approval so far has left a `PENDING` row nothing claimed. It adds no
    // queue and no transport — only a handler, and the claim filter grows by
    // exactly one event type.
    OrderConversionModule,
    // `InventoryReservationModule` (APP8-W01) is the fifth outbox capability,
    // and the consumer `payment.verified` has been waiting for since APP7-B04:
    // every verified deposit so far has left a `PENDING` row nothing claimed. It
    // adds no queue and no transport — only a handler, and the claim filter
    // grows by exactly one event type.
    InventoryReservationModule,
    // `OrderCreatedAcknowledgementModule` (`APP12-H03-C1`) is the sixth outbox
    // capability and the only one that performs no work: `order.created` has
    // been appended by every order creation since DB7 and claimed by nobody, so
    // each one left a row that was never retried, never dead-lettered and never
    // completed — permanently `PENDING`, and permanently in the backlog gauge
    // `APP12-H03` added. SE-006's notification obligation is already discharged
    // by the sealed-envelope path both creation flows request themselves, so the
    // correct disposition is an explicit acknowledgement rather than a second
    // notification trigger. The claim filter grows by exactly one event type.
    OrderCreatedAcknowledgementModule,
    // `IntakeCleanupModule` (APP5-B02) is the first capability here that is
    // **not** an outbox handler: an expired, unbound customer upload produces
    // no event to claim, which is precisely why it needs a sweep. It shares the
    // clock and the storage client but registers nothing with the handler
    // registry, so it cannot affect what the poll loop claims.
    IntakeCleanupModule,
    // `ReadyMadeReservationExpiryModule` (`APP12-B02`) is the second sweep and
    // the second non-outbox capability. `BR-025` gives a Ready-Made reservation
    // a 24-hour pre-payment window, and `BR-026` requires that window to
    // actually release stock and cancel the order — a timestamp with no
    // consumer is not production behaviour. It registers no handler either, so
    // the claim filter is unchanged.
    ReadyMadeReservationExpiryModule,
  ],
})
export class WorkerModule {}
