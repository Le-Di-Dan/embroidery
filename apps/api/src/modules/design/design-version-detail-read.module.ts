import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { CustomRequestDesignContextModule } from '../order/custom-request-design-context.module';
import { ReadDesignVersionDetailQuery } from './application/read-design-version-detail.query';
import { DESIGN_VERSION_DETAIL_PORT } from './domain/repositories/design-version-detail.port';
import { DrizzleDesignVersionDetailAdapter } from './infrastructure/persistence/drizzle-design-version-detail.adapter';
import { AdminCustomRequestDesignVersionDetailController } from './presentation/admin-custom-request-design-version-detail.controller';

/**
 * `APP6-A02` §5 — the one exact-version Admin design detail read.
 *
 * Composed beside `DesignVersionAuthoringModule` and `DesignVersionSendModule`
 * rather than folded into either, the arrangement `APP6-B09` and `APP6-B10` both
 * used and for the same reason: **what a module can inject is what its route can
 * eventually do.** Three write capabilities would otherwise arrive one import
 * away from a GET:
 *
 * - `DesignModule` exports `DESIGN_CASE_REPOSITORY` with `createVersion`,
 *   `sendForReview`, `recordReview`, `setCurrentVersion` and `supersede`, plus
 *   `DESIGN_SESSION_REPOSITORY`, `APPROVAL_SNAPSHOT_REPOSITORY` and the Session
 *   guard's whole dependency closure. It is deliberately **not** imported: this
 *   read reaches AGG-10 and AGG-11 through its own narrow port, which is also
 *   what keeps `FU-APP6-B09-CASE-REPO-SIZE-01` closed;
 * - `AuditModule` and `OutboxEventStore` would let a read record evidence or
 *   announce something. `DatabaseModule` is imported for the executor and does
 *   export `TransactionManager` and `OutboxEventStore`, but nothing composed
 *   here injects either — the adapter extends `DrizzleRepository`, whose only
 *   dependency is `DatabaseExecutor`, and the query holds one port;
 * - `ContentModule` would bring the whole AGG-21 `AGREEMENT_REPOSITORY` — the
 *   publication path, reachable from a request — for the sake of one integer.
 *   It is not imported, and `ApprovalAgreementEvidence` records why the
 *   agreement version integer is therefore not published.
 *
 * `IdentityModule` supplies the APP1 Admin guard. `CustomRequestDesignContextModule`
 * is Ordering's own narrow read contract for the request's design-case pointer —
 * the same one `APP6-B08`'s list uses, and the unlocked `findDesignContext` half
 * of it.
 *
 * It exports nothing. There is one entry point and it is one HTTP operation.
 */
@Module({
  imports: [IdentityModule, DatabaseModule, CustomRequestDesignContextModule],
  controllers: [AdminCustomRequestDesignVersionDetailController],
  providers: [
    ReadDesignVersionDetailQuery,
    { provide: DESIGN_VERSION_DETAIL_PORT, useClass: DrizzleDesignVersionDetailAdapter },
  ],
})
export class DesignVersionDetailReadModule {}
