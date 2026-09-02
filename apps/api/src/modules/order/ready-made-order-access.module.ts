import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

import { CustomerModule } from '../customer/customer.module';
import { InventoryModule } from '../inventory/inventory.module';
import { READY_MADE_ORDER_ACCESS_REPOSITORY } from './domain/repositories/ready-made-order-access.repository';
import { DrizzleReadyMadeOrderAccessRepository } from './infrastructure/persistence/drizzle-ready-made-order-access.repository';
import { ReadReadyMadeOrder } from './application/ready-made/read-ready-made-order.query';
import { PublicReadyMadeOrderAccessController } from './presentation/public-ready-made-order-access.controller';

/**
 * `APP12-B04` — the customer's one secure Ready-Made order read.
 *
 * A **separate module** from `ReadyMadeOrderModule`, on the arrangement
 * `CustomerDepositModule` / `CustomerDepositAttemptModule` established and for
 * its reason. That module is *defined* by holding the creation command's
 * collaborators: `ReadyMadeOrderRepository`, `OrderRepository`,
 * `SkuStockRepository`'s writer, the transaction manager, the idempotency store
 * and — since this checkpoint — the `ORDER_ACCESS` grant issuer. A read route
 * composed there could reach every one of them, which is to say it could place
 * an order, reserve stock or mint a credential. Here it cannot, because they
 * are not in the injector.
 *
 * ### What it may inject
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. The delivered APP4 policy,
 *   abuse budget and digest, resolving the `ORDER_ACCESS` grant. No issuer, no
 *   minter, no pepper and no revoker: this module cannot create, rotate or
 *   withdraw a grant;
 * - its own read-only projection repository, which selects an explicit column
 *   list over `orders`, `order_items` and `shipping_details` and has no write
 *   method at all;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract, for
 *   `findLiveForOrder(order, 'FULL')`. Its mutating methods all call
 *   `requireTransaction`, and no transaction manager is injected here, so they
 *   would throw rather than write even if one were reached;
 * - `InventoryModule` — `SKU_STOCK_REPOSITORY`, for the unlocked read of the
 *   order's live reservation, which is where the payment deadline comes from
 *   (§36). The same caveat applies: every reservation write on that contract
 *   requires a transaction this module cannot open;
 * - `DatabaseModule` — the executor the projection repository extends. It
 *   *does* also publish `TransactionManager` and `IdempotencyStore`, and
 *   neither is injected anywhere in this module: the absence is in the
 *   constructor lists, and the suite asserts the read writes nothing.
 *
 * ### What is absent, and what each absence prevents
 *
 * No `OrderModule` and no `ReadyMadeOrderModule`, so `ORDER_REPOSITORY`,
 * `READY_MADE_ORDER_REPOSITORY` and their `transition`, `saveShippingDetails`
 * and `setPayableTotal` writers are unreachable: a customer cannot move their
 * order, change its address, set its shipping fee or alter its total (§35), and
 * that is a property of this wiring. No `IdentityModule`, so no Admin guard and
 * no Admin route can exist here — verification and fulfilment are
 * `APP12-B05`'s. No outbox store, so a read can emit no event. No
 * `AssetModule`, no object storage and no QR encoder: the order read serves
 * JSON only. No catalog module, so no live price can reach a frozen line.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [DatabaseModule, CustomerModule, InventoryModule, PaymentPersistenceModule],
  controllers: [PublicReadyMadeOrderAccessController],
  providers: [
    {
      provide: READY_MADE_ORDER_ACCESS_REPOSITORY,
      useClass: DrizzleReadyMadeOrderAccessRepository,
    },
    ReadReadyMadeOrder,
  ],
})
export class ReadyMadeOrderAccessModule {}
