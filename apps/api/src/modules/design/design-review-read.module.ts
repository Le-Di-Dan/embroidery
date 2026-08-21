import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ContentModule } from '../content/content.module';
import { DESIGN_REVIEW_PORT } from './domain/repositories/design-review.port';
import { DrizzleDesignReviewAdapter } from './infrastructure/persistence/drizzle-design-review.adapter';
import { DesignApprovalAgreementsPolicyReader } from './infrastructure/policy/design-approval-agreements-policy.reader';
import { EffectiveAgreementsReader } from './application/review/effective-agreements.reader';

/**
 * Everything `APP6-B10`'s public read needs, narrowed to reads (`APP6-B10` §5).
 *
 * A provider module whose entire purpose is to **stop three write capabilities
 * one import away from a public route**, on the precedent
 * `CustomRequestQuotationPointerModule` and `CustomRequestDesignContextModule`
 * set for the same phase: Ordering publishes narrow contracts, and a consumer
 * imports the one it is allowed to hold rather than the aggregate containing it.
 *
 * Each of the three would otherwise arrive with a write side:
 *
 * - `DatabaseModule` exports `TransactionManager` and `OutboxEventStore`
 *   alongside `PolicyConfigurationRepository`. A public review surface that
 *   imported it directly could open a transaction and append a business event;
 * - `ContentModule` exports the whole AGG-21 `AGREEMENT_REPOSITORY`, which
 *   carries `ensureAgreement`, `addVersion`, `publishVersion`,
 *   `setCurrentVersion` and `withdrawVersion` — the publication path, reachable
 *   from a request;
 * - `DesignModule` exports `DESIGN_CASE_REPOSITORY` with `createVersion`,
 *   `sendForReview`, `recordReview` and `supersede`, plus
 *   `DESIGN_SESSION_REPOSITORY`, `APPROVAL_SNAPSHOT_REPOSITORY` and the Session
 *   guard's dependency closure.
 *
 * Both are imported **here** and neither is re-exported, so they confer nothing
 * on the module that imports this one. What leaves is three read capabilities:
 * `DESIGN_REVIEW_PORT` (two SELECTs, no lock, no write),
 * `DesignApprovalAgreementsPolicyReader` (one policy read) and
 * `EffectiveAgreementsReader` (one effective-set resolution). `DesignModule` is
 * deliberately **not** imported at all: `APP6-B10` reads through its own narrow
 * AGG-10 port, which is also what keeps `FU-APP6-B09-CASE-REPO-SIZE-01` closed.
 *
 * It declares no controller, so it publishes no route, and the agreement
 * *publisher* is not among its providers: `PublishApp6AgreementsUseCase` stays
 * on `ContentModule`, reachable only from the Admin-bearing staff-bootstrap CLI.
 */
@Module({
  imports: [DatabaseModule, ContentModule],
  providers: [
    { provide: DESIGN_REVIEW_PORT, useClass: DrizzleDesignReviewAdapter },
    DesignApprovalAgreementsPolicyReader,
    EffectiveAgreementsReader,
  ],
  exports: [DESIGN_REVIEW_PORT, DesignApprovalAgreementsPolicyReader, EffectiveAgreementsReader],
})
export class DesignReviewReadModule {}
