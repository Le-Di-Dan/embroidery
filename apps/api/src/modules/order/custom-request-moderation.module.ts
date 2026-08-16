import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { OrderModule } from './order.module';
import { AppendModerationNoteUseCase } from './application/moderation/append-moderation-note.use-case';
import { RequestModerationRecorder } from './application/moderation/request-moderation.recorder';
import { TransitionCustomRequestUseCase } from './application/moderation/transition-custom-request.use-case';
import { AdminCustomRequestModerationController } from './presentation/admin-custom-request-moderation.controller';

/**
 * `APP5-B05` — the Admin moderation write surface.
 *
 * A **fifth** APP5 module beside submission, intake, the customer status read
 * and the Admin read model, and the split from `CustomRequestAdminModule` is
 * the reason that module gave for existing: it deliberately does **not** import
 * `OrderModule`, so its two read routes have no `transition()` within reach.
 * This module is where that decision is composed deliberately — it imports the
 * AGG-13 write repository because writing is what it is for, and it hosts no
 * query.
 *
 * Its dependencies are exactly three, and each is a boundary rather than a
 * convenience:
 *
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, Ordering's own AGG-13 contract.
 *   No other context's tables are touched by anything here;
 * - `IdentityModule` — the APP1 guards, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `DatabaseModule` — the executor and `TransactionManager` the one moderation
 *   transaction runs on, and `OutboxEventStore` for the durable fact.
 *
 * There is no notification module import and no worker dependency:
 * `G01-D05b` makes an APP5 moderation consequence an outbox row, and delivery
 * is a later consumer's after-commit work. Nothing here can call a provider.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, OrderModule],
  controllers: [AdminCustomRequestModerationController],
  providers: [
    AppendModerationNoteUseCase,
    TransitionCustomRequestUseCase,
    RequestModerationRecorder,
  ],
})
export class CustomRequestModerationModule {}
