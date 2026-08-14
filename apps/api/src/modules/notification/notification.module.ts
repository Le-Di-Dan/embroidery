import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { RequestNotificationUseCase } from './application/request-notification.use-case';
import { DeliveryEnvelopeKeyProvider } from './config/delivery-envelope-key.provider';
import { NOTIFICATION_INTENT_REPOSITORY } from './domain/repositories/notification-intent.repository';
import { DrizzleNotificationIntentRepository } from './infrastructure/persistence/drizzle-notification-intent.repository';

/**
 * CTX-NTF — notification intents and delivery evidence (DB7-CP4, `APP4-B01`).
 *
 * DB7 owned the persistence boundary; `APP4-B01` adds the intake capability and
 * composes the module into the API for the first time.
 *
 * Still **no provider integration and no delivery**: there is no
 * `NotificationChannelPort`, no recording adapter, no worker handler and no
 * controller here. The module produces an intent and a `PENDING` outbox event
 * and stops — `APP4-W01` is what turns that event into a message.
 *
 * No exactly-once delivery claim is made, and `NotificationIntentRepository.claimBatch`
 * stays without a production caller: `outbox_events` is the queue (IMP-D029).
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: NOTIFICATION_INTENT_REPOSITORY, useClass: DrizzleNotificationIntentRepository },
    DeliveryEnvelopeKeyProvider,
    RequestNotificationUseCase,
  ],
  exports: [NOTIFICATION_INTENT_REPOSITORY, RequestNotificationUseCase],
})
export class NotificationModule {}
