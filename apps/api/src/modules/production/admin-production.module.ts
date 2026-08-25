import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { OrderProductionContextModule } from '../order/order-production-context.module';
import { OrderReservationSummaryModule } from '../inventory/order-reservation-summary.module';
import { CreateProductionJobUseCase } from './application/admin/create-production-job.use-case';
import { ReadProductionJobDetail } from './application/admin/read-production-job-detail.query';
import { ReadProductionQueue } from './application/admin/read-production-queue.query';
import { ADMIN_PRODUCTION_READ_REPOSITORY } from './domain/repositories/admin-production-read.repository';
import { DrizzleAdminProductionReadRepository } from './infrastructure/persistence/drizzle-admin-production-read.repository';
import { AdminOrderProductionJobController } from './presentation/admin-order-production-job.controller';
import { AdminProductionJobController } from './presentation/admin-production-job.controller';
import { ProductionModule } from './production.module';

/**
 * `APP8-B03` — the Admin production surface, and the composition that finally
 * makes CTX-PRD reachable in the running API.
 *
 * At APP8 entry `ProductionModule` was imported by one integration spec and by
 * **nothing in `AppModule`** (`APP8_PHASE_ENTRY_AUDIT.md`): the whole delivered
 * production layer was `REPOSITORY_DELIVERED` and `RUNTIME_COMPOSED = no`, and
 * `createJob` had no caller outside a test. Registering *this* module in
 * `AppModule` composes `ProductionModule` transitively, which is the whole of
 * the runtime composition §4 asks for.
 *
 * ### Production persistence stays API-local (`PO-APP8-006`)
 *
 * `ProductionModule` is imported, not promoted. Nothing in `apps/worker` writes
 * production — `PO-APP8-003` makes creation Admin-initiated and synchronous, and
 * `PO-APP8-004` removes every artifact and machine-runner consumer — so moving
 * it into `@embroidery/persistence` would be symmetry with Inventory rather than
 * the demonstrated cross-runtime need `IMP-D054` requires. No second production
 * repository implementation exists anywhere in the repository.
 *
 * ### Why a second module rather than controllers on `ProductionModule`
 *
 * `ProductionModule` is the persistence module. Mounting Admin controllers on it
 * would put `IdentityModule` — the staff guards, the session store, the login
 * rate limiter — into the injector of every suite that only wants a repository,
 * and would make the DB7 production suite boot the APP1 authentication stack to
 * prove a specification freeze. It is the same split `AdminSkuStockModule` /
 * `InventoryModule` and `AdminOrderModule` / `OrderModule` already use, and for
 * the same reason.
 *
 * ### What it may inject, which is what its three routes may do
 *
 * - `ProductionModule` — `PRODUCTION_JOB_REPOSITORY`, the one delivered AGG-17
 *   contract, for `createJob` and its in-transaction specification freeze;
 * - `ADMIN_PRODUCTION_READ_REPOSITORY` — this module's own read seam, provided
 *   here because it is a projection for these two routes and nothing else
 *   resolves it. It has no create, no transition and no transaction;
 * - `OrderProductionContextModule` — one read-only Ordering port, for the
 *   order's own approval reference and its subject counts;
 * - `OrderReservationSummaryModule` — one read-only Inventory port, for the
 *   display-only reservation context;
 * - `PaymentPersistenceModule` — the single `DEPOSIT_ELIGIBILITY_PORT`
 *   (`APP8-G01` §7.1), the GRD-013 authority creation gates on;
 * - `IdentityModule` — the APP1 guards. No session is read here, no cookie
 *   parsed, and no operator identity is ever a parameter;
 * - `DatabaseModule` — `TransactionManager` and the read adapter's executor.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `OrderModule` and no `OrderPersistenceModule`, so no route here
 * can move an order to `IN_PRODUCTION` or anywhere else (§13). There is no
 * `InventoryModule`, so `SKU_STOCK_REPOSITORY` is unreachable and no route can
 * create, consume or release a reservation — the reservation port it does hold
 * returns rows and has no write. There is no Catalog, Design or Quotation
 * module, so the frozen specification cannot be reconstructed from live state
 * by accident. There is no `OutboxEventStore`, so no route can announce
 * anything, and no object storage, so no route can open an internal artifact.
 *
 * It exports nothing. There are three entry points and all three are HTTP
 * operations.
 */
@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    OrderProductionContextModule,
    OrderReservationSummaryModule,
    PaymentPersistenceModule,
    ProductionModule,
  ],
  controllers: [AdminOrderProductionJobController, AdminProductionJobController],
  providers: [
    {
      provide: ADMIN_PRODUCTION_READ_REPOSITORY,
      useClass: DrizzleAdminProductionReadRepository,
    },
    CreateProductionJobUseCase,
    ReadProductionQueue,
    ReadProductionJobDetail,
  ],
})
export class AdminProductionModule {}
