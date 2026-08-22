/**
 * The order-conversion capability's composition root (`APP7-W01` §24).
 *
 * A fourth capability on the one runtime, not a fourth runtime. Registration
 * happens in `onModuleInit`, exactly as the delivered capabilities do, so the
 * handler is in the registry before the poll loop issues its first claim without
 * this module knowing anything about the loop's ordering. The registry refuses
 * two handlers for one event type, so the capabilities cannot silently overlap.
 *
 * `WorkerRuntimeModule` is imported, never the other way round, and no runtime
 * file was changed by this checkpoint.
 *
 * Three providers, and they are the narrow set the handler actually needs:
 * the repository behind its port, the use case, and the handler. `DatabaseModule`
 * supplies `TransactionManager`, `IdempotencyStore` and `OutboxEventStore` —
 * already exported, already used by every other capability, no second pool and
 * no new workspace dependency. Nothing from `apps/api` is imported, and no
 * object storage, notification channel or policy service is pulled in: order
 * conversion needs none of them.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { ConvertApprovedDesignUseCase } from './application/convert-approved-design.usecase';
import { ORDER_CONVERSION_REPOSITORY } from './domain/repositories/order-conversion.repository';
import { WorkerOrderChainGuard } from './infrastructure/persistence/order-chain.guard';
import { SqlOrderConversionRepository } from './infrastructure/persistence/sql-order-conversion.repository';
import { OrderConversionHandler } from './order-conversion.handler';

@Module({
  imports: [DatabaseModule, WorkerRuntimeModule],
  providers: [
    WorkerOrderChainGuard,
    { provide: ORDER_CONVERSION_REPOSITORY, useClass: SqlOrderConversionRepository },
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
