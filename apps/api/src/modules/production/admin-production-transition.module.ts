import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  InventoryPersistenceModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductionReservationCoordinator } from './application/admin/production-reservation.coordinator';
import { ProductionTransitionRecorder } from './application/admin/production-transition.recorder';
import { TransitionProductionJobUseCase } from './application/admin/transition-production-job.use-case';
import { AdminProductionTransitionController } from './presentation/admin-production-transition.controller';
import { ProductionModule } from './production.module';

/**
 * `APP8-B04` — the guarded production transitions, and the write authorities
 * they genuinely need (§18).
 *
 * ### Why a second Admin production module
 *
 * `APP8-B03`'s `AdminProductionModule` is deliberately composed so its three
 * routes **cannot** move an order or terminalize a reservation: it imports no
 * `OrderPersistenceModule` and no `InventoryPersistenceModule`, and its report
 * states that absence as the structural reason a read or a creation cannot do
 * either. B04's transitions must do both. Adding those writers to that module
 * would put an order transition and a stock decrement into the injector of a
 * queue projection and a job creation that must never reach them, and would
 * quietly retire a boundary the previous checkpoint was accepted on.
 *
 * So the write authorities arrive in their own module, and B03's stays exactly
 * as delivered. Both controllers publish into the one `adminProductionJob`
 * domain through `CONTROLLER_DOMAIN_KEYS`, so a composition decision does not
 * name a public identifier — the same mechanism nine other split surfaces use.
 *
 * ### What it may inject, which is what its one route may do
 *
 * | Imported | For |
 * |---|---|
 * | `ProductionModule` | `PRODUCTION_JOB_REPOSITORY` — `loadForUpdate` and the LC-18 `transition` |
 * | `OrderPersistenceModule` | the canonical `ORDER_REPOSITORY` — `loadForUpdate`, `loadItems`, `transition` |
 * | `InventoryPersistenceModule` | the canonical shared `SKU_STOCK_REPOSITORY` — the two order-scoped terminalizations |
 * | `PaymentPersistenceModule` | the single `DEPOSIT_ELIGIBILITY_PORT` (`APP8-G01` §7.1) |
 * | `AuditModule` | `AUDIT_EVENT_REPOSITORY` — the accepted production audit rows |
 * | `IdentityModule` | the APP1 guards, and nothing else |
 * | `DatabaseModule` | `TransactionManager` and `OutboxEventStore` |
 *
 * Every one of those is a canonical implementation reached through its token.
 * **No persistence is promoted and none is duplicated**: production stays
 * API-local (`PO-APP8-006`), the order and inventory writers stay in
 * `@embroidery/persistence`, and no SQL for orders or inventory is written
 * anywhere in this module. Orchestration is the application layer's; mutation is
 * the repositories'.
 *
 * ### What is still absent
 *
 * There is no `OrderReservationSummaryModule`. B03's summary port is unlocked
 * and display-only (`FU-APP8-B02-02`, `FU-APP8-B03-02`), and the surest way for
 * a start decision not to be taken from it is for this module not to provide it.
 * There is no object storage and no artifact path (`PO-APP8-004`), no payment
 * writer — `PaymentPersistenceModule` supplies a read-only eligibility port —
 * no shipping, and no refund. It exports nothing, and has one entry point.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    IdentityModule,
    InventoryPersistenceModule,
    OrderPersistenceModule,
    PaymentPersistenceModule,
    ProductionModule,
  ],
  controllers: [AdminProductionTransitionController],
  providers: [
    TransitionProductionJobUseCase,
    ProductionReservationCoordinator,
    ProductionTransitionRecorder,
  ],
})
export class AdminProductionTransitionModule {}
