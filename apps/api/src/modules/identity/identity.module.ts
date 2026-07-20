import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ADMIN_ACCOUNT_REPOSITORY } from './domain/repositories/admin-account.repository';
import { ADMIN_SESSION_REPOSITORY } from './domain/repositories/admin-session.repository';
import { DrizzleAdminAccountRepository } from './infrastructure/persistence/drizzle-admin-account.repository';
import { DrizzleAdminSessionRepository } from './infrastructure/persistence/drizzle-admin-session.repository';

/**
 * CTX-IDN — admin identity persistence (DB7-CP3).
 *
 * Repositories are bound to their domain-layer tokens so consumers depend on
 * the interface, never on the Drizzle class (`BACKEND_CONVENTIONS.md` §10).
 * No controllers yet: DB7 is the persistence phase.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ADMIN_ACCOUNT_REPOSITORY, useClass: DrizzleAdminAccountRepository },
    { provide: ADMIN_SESSION_REPOSITORY, useClass: DrizzleAdminSessionRepository },
  ],
  exports: [ADMIN_ACCOUNT_REPOSITORY, ADMIN_SESSION_REPOSITORY],
})
export class IdentityModule {}
