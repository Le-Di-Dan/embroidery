import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { AdjustSkuStockUseCase } from './application/admin/adjust-sku-stock.use-case';
import { ReadSkuStockQuery } from './application/admin/read-sku-stock.query';
import { ReadSkuStockLedgerQuery } from './application/admin/read-sku-stock-ledger.query';
import { SkuStockAnchorProvisioner } from './application/admin/sku-stock-anchor.provisioner';
import { StockAdjustmentRecorder } from './application/admin/stock-adjustment.recorder';
import { InventoryModule } from './inventory.module';
import { AdminSkuStockController } from './presentation/admin-sku-stock.controller';

/**
 * `APP8-B01` — the Admin stock surface, and the composition that finally makes
 * CTX-INV reachable in the running API.
 *
 * At APP8 entry `InventoryModule` was imported by three integration specs and
 * two DB9 benchmarks and by **nothing in `AppModule`**
 * (`APP8_PHASE_ENTRY_AUDIT.md` §5.3): the whole delivered inventory layer was
 * `REPOSITORY_DELIVERED` and `RUNTIME_COMPOSED = no`. Registering *this* module
 * in `AppModule` composes `InventoryModule` transitively, which is the whole of
 * the runtime composition `APP8-B01` §7 asks for.
 *
 * ### Why a second module rather than a controller on `InventoryModule`
 *
 * `InventoryModule` is the persistence module. Mounting an Admin controller on
 * it would put `IdentityModule` — the staff guards, the session store, the
 * login rate limiter — into the injector of every suite and benchmark that only
 * wants a repository, and would make the DB7/DB8 inventory suites boot the APP1
 * authentication stack to prove a row lock. Keeping the surface separate is the
 * same split `AdminOrderPaymentModule` / `PaymentModule` and
 * `CustomerAdminSupportModule` / `CustomerModule` already use, and for the same
 * reason. It also keeps the two `admin/skus` surfaces apart: `CatalogSkuModule`
 * owns the variant lock and the order-eligible invariant, and a stock route
 * must not be able to reach either.
 *
 * ### What it may inject, which is what its three routes may do
 *
 * - `InventoryModule` — `SKU_STOCK_REPOSITORY`, the one delivered AGG-07
 *   contract. There is no second stock repository, no inventory SQL in this
 *   module, and no duplicated availability arithmetic;
 * - `IdentityModule` — the APP1 guards. No session is read here, no cookie
 *   parsed, and no operator identity is ever a parameter;
 * - `DatabaseModule` — `TransactionManager` only. One transaction per
 *   operation, opened by the use case as `DEC-DB7-006` requires;
 * - `AuditModule` — the delivered append-only audit writer, for the
 *   `DB3_AUDIT_SPECIFICATION.md` "Stock adjustment & override" row;
 * - `AuditContextModule` — the injectable clock, so a suite can pin the instant
 *   rather than the adjustment path calling `new Date()`.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `OrderPersistenceModule` and no `PaymentPersistenceModule`, so no
 * route here can move an order, satisfy an obligation or read a payment. There
 * is no Catalog module and no `PRODUCT_SKU_REPOSITORY`: whether a SKU exists is
 * `fk_sku_stocks__sku_id`'s answer, not a second Catalog read reachable from an
 * Inventory injector. There is no `ProductionModule` — `APP8-B01` §7 leaves
 * production persistence untouched — no `OutboxEventStore`, so no route can
 * announce anything, and no object storage, so no route can open a byte.
 *
 * It exports nothing. There are three entry points and all three are HTTP
 * operations.
 */
@Module({
  imports: [AuditContextModule, AuditModule, DatabaseModule, IdentityModule, InventoryModule],
  controllers: [AdminSkuStockController],
  providers: [
    SkuStockAnchorProvisioner,
    StockAdjustmentRecorder,
    ReadSkuStockQuery,
    ReadSkuStockLedgerQuery,
    AdjustSkuStockUseCase,
  ],
})
export class AdminSkuStockModule {}
