import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { IdentityModule } from '../identity/identity.module';
import { CustomRequestDesignContextModule } from '../order/custom-request-design-context.module';
import { AuthorDesignVersionUseCase } from './application/author-design-version.use-case';
import { DesignVersionAuditRecorder } from './application/design-version-audit.recorder';
import { DesignVersionBranchResolver } from './application/design-version-branch.resolver';
import { FormalDesignVersionAuthority } from './application/formal-design-version.authority';
import { ListDesignVersionsQuery } from './application/list-design-versions.query';
import { SessionPlacementResolver } from './application/session-placement.authority';
import { DESIGN_CASE_REPOSITORY } from './domain/repositories/design-case.repository';
import { SUBMITTED_DESIGN_PLACEMENT_PORT } from './domain/repositories/submitted-design-placement.port';
import { DrizzleDesignCaseRepository } from './infrastructure/persistence/drizzle-design-case.repository';
import { DrizzleSubmittedDesignPlacementRepository } from './infrastructure/persistence/drizzle-submitted-design-placement.repository';
import { AdminCustomRequestDesignVersionController } from './presentation/admin-custom-request-design-version.controller';

/**
 * `APP6-B08` — formal Design Version authoring and history.
 *
 * A module of its own rather than a widening of `DesignModule`, and the reason
 * is the reason `APP6-B07` gave for its two: what a module can inject is what
 * its routes can eventually do.
 *
 * Its dependencies are five, and the short list is the point:
 *
 * - `IdentityModule` — the APP1 Admin guard and the two staff mutation guards;
 * - `DatabaseModule` — the executor and the `TransactionManager` the authoring
 *   transaction genuinely needs. Unlike B07's read modules, this one *is* a
 *   write, so a transaction must be reachable; what bounds it is the second
 *   list below;
 * - `CustomRequestDesignContextModule` — one read-only Ordering port. Not
 *   `OrderModule`, which exports the AGG-13 write contract, so `transition()`,
 *   `submit()` and `setCurrentQuotation()` are unreachable from this injector
 *   and `TR-LC11-08` cannot be projected here by any code path;
 * - `CatalogPlacementReadModule` — the placement read that resolves the live
 *   Side and Area rows a document is reconciled against;
 * - `CatalogModule` — for `PLACEMENT_HIERARCHY_PORT`, which proves the Catalog
 *   quartet forms one chain (G-DB7-10..13). `DesignModule` imports it for
 *   exactly this and no narrower module publishes the port. It also exports
 *   `PRODUCT_REPOSITORY`, so that contract is reachable in this injector — the
 *   one dependency here that is wider than what is used. Nothing in this module
 *   injects it, and no placement is ever *created* to satisfy a version: a
 *   missing Catalog identity is the loud refusal `ADR-APP6-001` requires;
 * - `AuditModule` — the append-only evidence `TR-LC08-01` requires.
 *
 * What is **absent** bounds the checkpoint. There is no quotation repository, no
 * approval-snapshot repository, no secure-grant issuer, no notification port and
 * **no outbox**: `SE-004 design.review-ready` is `APP6-B09`'s event and nothing
 * composed here could emit it, or any other. There is no asset repository and no
 * object-storage client, so no preview can be rendered, stored or served. There
 * is no design-session write repository, so the submitted source a Catalog
 * version is authored from cannot be modified by anything on this path.
 *
 * It exports nothing. There are two entry points and they are the two routes.
 */
@Module({
  imports: [
    IdentityModule,
    DatabaseModule,
    CustomRequestDesignContextModule,
    CatalogPlacementReadModule,
    CatalogModule,
    AuditModule,
  ],
  controllers: [AdminCustomRequestDesignVersionController],
  providers: [
    AuthorDesignVersionUseCase,
    ListDesignVersionsQuery,
    DesignVersionBranchResolver,
    FormalDesignVersionAuthority,
    DesignVersionAuditRecorder,
    SessionPlacementResolver,
    { provide: DESIGN_CASE_REPOSITORY, useClass: DrizzleDesignCaseRepository },
    {
      provide: SUBMITTED_DESIGN_PLACEMENT_PORT,
      useClass: DrizzleSubmittedDesignPlacementRepository,
    },
  ],
})
export class DesignVersionAuthoringModule {}
