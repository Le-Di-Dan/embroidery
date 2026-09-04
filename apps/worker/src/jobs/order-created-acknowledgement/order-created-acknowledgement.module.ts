/**
 * The `order.created` acknowledgement's composition root (`APP12-H03-C1` §10).
 *
 * The seventh capability on the one runtime, and the smallest one there will
 * ever be: a handler, and nothing else. It imports no persistence module, no
 * object storage, no clock and no policy service, because it reads nothing and
 * writes nothing — `WorkerRuntimeModule` alone, for the registry.
 *
 * Registration happens in `onModuleInit`, exactly as every delivered capability
 * does, so the handler is in the registry before the poll loop issues its first
 * claim without this module knowing anything about the loop's ordering. The
 * claim filter then grows by exactly one event type, which is the whole of this
 * module's effect on what the worker claims.
 */
import { Module, type OnModuleInit } from '@nestjs/common';

import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { OrderCreatedAcknowledgementHandler } from './order-created-acknowledgement.handler';

@Module({
  imports: [WorkerRuntimeModule],
  providers: [OrderCreatedAcknowledgementHandler],
  exports: [OrderCreatedAcknowledgementHandler],
})
export class OrderCreatedAcknowledgementModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: OrderCreatedAcknowledgementHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
