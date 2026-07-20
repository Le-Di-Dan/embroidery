import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AGREEMENT_REPOSITORY } from './domain/repositories/agreement.repository';
import {
  CONTENT_PAGE_REPOSITORY,
  REDIRECT_RULE_REPOSITORY,
} from './domain/repositories/content-page.repository';
import { DrizzleAgreementRepository } from './infrastructure/persistence/drizzle-agreement.repository';
import {
  DrizzleContentPageRepository,
  DrizzleRedirectRuleRepository,
} from './infrastructure/persistence/drizzle-content-page.repository';

/**
 * CTX-CNT — SEO pages, redirects and agreements (DB7-CP3).
 *
 * `DB2_BOUNDED_CONTEXT_MAP.md` decided Content owns Agreement rather than
 * splitting off a Policy context: one admin, few documents, and the versioning
 * semantics live on the aggregate.
 *
 * Exports `AGREEMENT_REPOSITORY` so Design can resolve the effective agreement
 * set when building an approval snapshot (GRD-008).
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: AGREEMENT_REPOSITORY, useClass: DrizzleAgreementRepository },
    { provide: CONTENT_PAGE_REPOSITORY, useClass: DrizzleContentPageRepository },
    { provide: REDIRECT_RULE_REPOSITORY, useClass: DrizzleRedirectRuleRepository },
  ],
  exports: [AGREEMENT_REPOSITORY, CONTENT_PAGE_REPOSITORY, REDIRECT_RULE_REPOSITORY],
})
export class ContentModule {}
