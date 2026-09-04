/**
 * The notification-delivery capability's composition root (`APP4-W01`).
 *
 * A third capability on the one runtime, not a third runtime. Registration
 * happens in `onModuleInit`, exactly as the two Asset modules do, so the handler
 * is in the registry before the poll loop issues its first claim without this
 * module knowing anything about the loop's ordering. The registry refuses two
 * handlers for one event type, so the capabilities cannot silently overlap.
 *
 * `WorkerRuntimeModule` is imported, never the other way round. The only runtime
 * files this checkpoint touched are additive: the execution context now carries
 * the claimed row's aggregate linkage, and a handler may publish its own retry
 * plan. Neither changes what claiming, leasing or completion do for any existing
 * handler.
 *
 * The channel port is bound to the recording development adapter, and that is
 * the whole provider decision APP4 makes (`ADR-APP4-001` §12). A real transport
 * arrives as a second adapter behind the same symbol.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { NotificationDeliveryUseCase } from './application/notification-delivery.usecase';
import { WorkerDeliveryEnvelopeKeyProvider } from './config/delivery-envelope-key.provider';
import { StorefrontPublicOriginProvider } from './config/storefront-origin.provider';
import { NOTIFICATION_CHANNEL_PORT } from './domain/channel/notification-channel.port';
import { NOTIFICATION_DELIVERY_REPOSITORY } from './domain/repositories/notification-delivery.repository';
import { RecordingNotificationChannelAdapter } from './infrastructure/channel/recording-notification-channel.adapter';
import { SqlNotificationDeliveryRepository } from './infrastructure/persistence/sql-notification-delivery.repository';
import { NotificationDeliveryPolicyService } from './infrastructure/policy/notification-delivery-policy.service';
import { NotificationDeliveryHandler } from './notification-delivery.handler';
import { NotificationDeliveryMetrics } from './application/notification-delivery.metrics';
import { WorkerMetricsModule } from '../../runtime/metrics/worker-metrics.module';

@Module({
  imports: [WorkerMetricsModule, DatabaseModule, WorkerRuntimeModule],
  providers: [
    { provide: NOTIFICATION_DELIVERY_REPOSITORY, useClass: SqlNotificationDeliveryRepository },
    RecordingNotificationChannelAdapter,
    { provide: NOTIFICATION_CHANNEL_PORT, useExisting: RecordingNotificationChannelAdapter },
    NotificationDeliveryPolicyService,
    WorkerDeliveryEnvelopeKeyProvider,
    StorefrontPublicOriginProvider,
    NotificationDeliveryMetrics,
    NotificationDeliveryUseCase,
    NotificationDeliveryHandler,
  ],
  exports: [NotificationDeliveryHandler],
})
export class NotificationDeliveryModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: NotificationDeliveryHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
