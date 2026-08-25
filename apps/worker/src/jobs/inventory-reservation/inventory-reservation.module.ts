/**
 * The inventory-reservation capability's composition root (`APP8-W01` §14, §15).
 *
 * A fifth capability on the one runtime, not a fifth runtime. Registration
 * happens in `onModuleInit`, exactly as the delivered capabilities do, so the
 * handler is in the registry before the poll loop issues its first claim without
 * this module knowing anything about the loop's ordering. The registry refuses
 * two handlers for one event type, so the capabilities cannot silently overlap.
 *
 * ### Both repositories come from the shared package
 *
 * `OrderPersistenceModule` and `InventoryPersistenceModule` are the **same** Nest
 * modules `apps/api` imports, from `@embroidery/persistence`. That is the whole
 * point of `APP8-B02` / `PO-APP8-006`: one implementation of the availability
 * arithmetic, of the `sku_stocks` anchor lock and of the GRD-013 deposit gate,
 * resolved identically by both applications. There is no worker-local inventory
 * adapter and no worker-local eligibility check to fall out of step with them,
 * and still no app-to-app import.
 *
 * `InventoryPersistenceModule` already imports `PaymentPersistenceModule` for
 * `DEPOSIT_ELIGIBILITY_PORT`, so this module does not — the deposit authority is
 * reached through the guard inside the aggregate, never around it.
 *
 * This capability declares **no repository of its own**. Unlike
 * `OrderConversionModule`, which needed a local read of conversion inputs no
 * canonical repository owns, everything W01 reads is already on a shared
 * contract: `OrderRepository.findById` and `.loadItems` publish the frozen
 * order-item subjects and quantities (`APP8-W01` §14), so no new persistence
 * contract, query or module was added.
 *
 * `DatabaseModule` supplies `TransactionManager` and `IdempotencyStore`; no
 * second pool, no object storage, no notification channel, no policy service.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import {
  DatabaseModule,
  InventoryPersistenceModule,
  OrderPersistenceModule,
} from '@embroidery/persistence';

import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { ReserveOrderInventoryUseCase } from './application/reserve-order-inventory.usecase';
import { InventoryReservationHandler } from './inventory-reservation.handler';

@Module({
  imports: [
    DatabaseModule,
    WorkerRuntimeModule,
    OrderPersistenceModule,
    InventoryPersistenceModule,
  ],
  providers: [ReserveOrderInventoryUseCase, InventoryReservationHandler],
  exports: [InventoryReservationHandler],
})
export class InventoryReservationModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: InventoryReservationHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
