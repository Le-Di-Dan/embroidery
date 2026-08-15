import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { CustomerModule } from '../customer/customer.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationModule } from './notification.module';
import { AdminNotificationIntentQuery } from './application/admin-notification-intent.query';
import { NotificationReplayAuditRecorder } from './application/notification-replay-audit.recorder';
import { ReplayEligibilityResolver } from './application/replay-eligibility.resolver';
import { ReplayNotificationDeliveryUseCase } from './application/replay-notification-delivery.use-case';
import { NotificationClock } from './infrastructure/clock/notification-clock';
import { AdminNotificationIntentController } from './presentation/admin-notification-intent.controller';

/**
 * The Admin notification delivery surface (`APP4-B08`).
 *
 * A **separate module** from `NotificationModule`, following
 * `CustomerAdminSupportModule` and `DesignTemplateAdminModule`. Two reasons, and
 * the second is the one that matters:
 *
 * 1. `NotificationModule` is the intake path — it holds no staff-auth
 *    dependency, and folding two authenticated Admin routes in would pull
 *    `IdentityModule`, its cookie policy and its session repository into the
 *    module that serves an anonymous verification flow.
 * 2. **It keeps `APP4-B01`'s boundary exactly where that checkpoint drew it.**
 *    `RequestNotificationUseCase` was built so intake needs no customer or grant
 *    repository, and its gate asserts that. Replay eligibility *does* need both
 *    — it must ask whether the sealed code is still answerable — so the resolver
 *    that reaches them is wired here, in the module that already composes both
 *    contexts, and `NotificationModule`'s dependency closure is untouched.
 *
 * ### What it imports, and why nothing else
 *
 * - `IdentityModule` — the two APP1 guards, and nothing else. No session is read
 *   here and no cookie parsed.
 * - `NotificationModule` — the intent repository port, already exported. The
 *   envelope-key provider is **not** imported and must never be: this module has
 *   no reason to hold the AEAD key, because it copies ciphertext rather than
 *   opening it.
 * - `CustomerModule` — the challenge and grant **ports** the eligibility check
 *   reads. Both are already exported; no persistence internals are reached.
 * - `AuditModule` — the append-only evidence a replay must leave.
 * - `DatabaseModule` — `OutboxEventStore` and `TransactionManager`.
 *
 * There is no `@embroidery/notification-delivery` import anywhere in this
 * module's files. That absence is the structural half of "the API never
 * decrypts": there is no symbol in scope that could open an envelope, so no edit
 * to a single file can introduce one without also changing this composition.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule, NotificationModule, CustomerModule],
  controllers: [AdminNotificationIntentController],
  providers: [
    NotificationClock,
    AdminNotificationIntentQuery,
    ReplayEligibilityResolver,
    NotificationReplayAuditRecorder,
    ReplayNotificationDeliveryUseCase,
  ],
})
export class NotificationAdminModule {}
