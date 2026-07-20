import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { NOTIFICATION_INTENT_REPOSITORY } from './domain/repositories/notification-intent.repository';
import { DrizzleNotificationIntentRepository } from './infrastructure/persistence/drizzle-notification-intent.repository';

/**
 * CTX-NTF — notification intents and delivery evidence (DB7-CP4).
 *
 * DB7 owns the persistence boundaries only. No provider integration, and no
 * exactly-once delivery claim.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: NOTIFICATION_INTENT_REPOSITORY, useClass: DrizzleNotificationIntentRepository },
  ],
  exports: [NOTIFICATION_INTENT_REPOSITORY],
})
export class NotificationModule {}
