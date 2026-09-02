/**
 * The Ready-Made reservation-expiry capability's composition root (`BR-026`,
 * `APP12-B02` §20).
 *
 * Like `IntakeCleanupModule` and unlike the four outbox capabilities beside it,
 * this module registers **no handler**: expiry produces no event, so there is
 * nothing for `JobHandlerRegistry` to route and nothing this module can change
 * about what the poll loop claims. What it contributes is its own small
 * schedule, which is why it imports `WorkerRuntimeModule` — for `WORKER_CLOCK`,
 * so the sweep's sleep is the same injectable delay the poll loop uses and is
 * therefore testable without waiting a real minute.
 *
 * `InventoryPersistenceModule` and `OrderPersistenceModule` are imported for
 * the two delivered writers this sweep acts through —
 * `SKU_STOCK_REPOSITORY.expireReservationIfDue` and
 * `READY_MADE_ORDER_REPOSITORY.transitionReadyMade`. It binds no writer of its
 * own: a worker-local copy of a terminal inventory write or an order transition
 * is exactly the duplication `PO-APP8-006` and `APP7-W01-C1` corrected, and it
 * would be free to disagree with the one the API calls.
 *
 * The only thing it does bind is the candidate query, which is genuinely this
 * job's own: nothing else in the repository asks "which reservations look due".
 *
 * It exports the use case so a focused suite can drive one pass directly
 * instead of waiting for the schedule — the schedule itself is one line of
 * behaviour and is proved separately.
 */
import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  InventoryPersistenceModule,
  OrderPersistenceModule,
} from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { ExpireReadyMadeReservationsUseCase } from './application/expire-reservations.usecase';
import { DUE_RESERVATION_REPOSITORY } from './domain/repositories/due-reservation.repository';
import { SqlDueReservationRepository } from './infrastructure/persistence/sql-due-reservation.repository';
import { ReservationExpiryRuntimeService } from './reservation-expiry.runtime';

@Module({
  imports: [
    DatabaseModule,
    WorkerRuntimeModule,
    InventoryPersistenceModule,
    OrderPersistenceModule,
  ],
  providers: [
    { provide: DUE_RESERVATION_REPOSITORY, useClass: SqlDueReservationRepository },
    ExpireReadyMadeReservationsUseCase,
    ReservationExpiryRuntimeService,
  ],
  exports: [ExpireReadyMadeReservationsUseCase],
})
export class ReadyMadeReservationExpiryModule {}
