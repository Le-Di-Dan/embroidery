/**
 * The order-conversion capability's composition root (`APP7-W01` §24, corrected
 * by `APP7-W01-C1`).
 *
 * A fourth capability on the one runtime, not a fourth runtime. Registration
 * happens in `onModuleInit`, exactly as the delivered capabilities do, so the
 * handler is in the registry before the poll loop issues its first claim without
 * this module knowing anything about the loop's ordering. The registry refuses
 * two handlers for one event type, so the capabilities cannot silently overlap.
 *
 * ### The canonical repositories come from the shared package
 *
 * `OrderPersistenceModule` and `PaymentPersistenceModule` are the **same** Nest
 * modules `apps/api` imports, from `@embroidery/persistence`. That is the whole
 * of `APP7-W01-C1`: one implementation of GRD-009, of the Order aggregate and of
 * the obligation pair, resolved identically by both applications. There is no
 * worker-local Order writer and no worker-local chain guard to fall out of step
 * with them, and still no app-to-app import.
 *
 * `ConversionAuthorityRepository` stays local because what it reads — the frozen
 * Approval Snapshot projection, the accepted version's priced lines, the active
 * SKU set, the customer-owned product — is conversion input that no canonical
 * repository owns (`APP7-W01` §6). It writes nothing.
 *
 * `DatabaseModule` supplies `TransactionManager` and `IdempotencyStore`; no
 * second pool, no object storage, no notification channel, no policy service.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import {
  DatabaseModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { ConvertApprovedDesignUseCase } from './application/convert-approved-design.usecase';
import { CONVERSION_AUTHORITY_REPOSITORY } from './domain/repositories/conversion-authority.repository';
import { SqlConversionAuthorityRepository } from './infrastructure/persistence/sql-conversion-authority.repository';
import { OrderConversionHandler } from './order-conversion.handler';

@Module({
  imports: [DatabaseModule, WorkerRuntimeModule, OrderPersistenceModule, PaymentPersistenceModule],
  providers: [
    { provide: CONVERSION_AUTHORITY_REPOSITORY, useClass: SqlConversionAuthorityRepository },
    ConvertApprovedDesignUseCase,
    OrderConversionHandler,
  ],
  exports: [OrderConversionHandler],
})
export class OrderConversionModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: OrderConversionHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
