import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { IdentityModule } from '../identity/identity.module';
import { CustomRequestDesignContextModule } from '../order/custom-request-design-context.module';
import { OrderModule } from '../order/order.module';
import { DesignVersionBranchResolver } from './application/design-version-branch.resolver';
import { FormalDesignVersionAuthority } from './application/formal-design-version.authority';
import { SessionPlacementResolver } from './application/session-placement.authority';
import { DesignVersionFreezeAuthority } from './application/sending/design-version-freeze.authority';
import { DesignVersionSendRecorder } from './application/sending/design-version-send.recorder';
import { SendDesignVersionUseCase } from './application/sending/send-design-version.use-case';
import { DESIGN_CASE_REPOSITORY } from './domain/repositories/design-case.repository';
import { SUBMITTED_DESIGN_PLACEMENT_PORT } from './domain/repositories/submitted-design-placement.port';
import { DrizzleDesignCaseRepository } from './infrastructure/persistence/drizzle-design-case.repository';
import { DrizzleSubmittedDesignPlacementRepository } from './infrastructure/persistence/drizzle-submitted-design-placement.repository';
import { AdminCustomRequestDesignVersionSendController } from './presentation/admin-custom-request-design-version-send.controller';

/**
 * `APP6-B09` — sending one formal Design Version for review (`TR-LC08-02`).
 *
 * Composed beside `DesignVersionAuthoringModule` rather than folded into it, the
 * arrangement `APP6-B03` used for the quotation send and for the same reason:
 * what a module can inject is what its routes can eventually do. B08's module is
 * *defined* by holding no order write repository and no outbox — that is what
 * lets its suite say an authoring route cannot move a request or announce
 * anything — and this checkpoint needs both. Widening B08's injector to serve
 * B09 would silently retire that claim.
 *
 * Its dependencies are seven, and each is a boundary:
 *
 * - `IdentityModule` — the APP1 Admin guard and the staff origin guard;
 * - `DatabaseModule` — the executor, `TransactionManager` for the send
 *   transaction and `OutboxEventStore` for the `SE-004 design.review-ready`
 *   event;
 * - `CustomRequestDesignContextModule` — the read-only Ordering port that locks
 *   the request row and carries the branch subject the freeze check reads;
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, CTX-ORD's own AGG-13 write
 *   contract. The `TR-LC11-08` projection goes through that published port,
 *   never by touching Ordering's tables. This is the first Design surface that
 *   may move a custom request, and it may move it to exactly one state, from
 *   exactly one state, with a `SYSTEM` actor;
 * - `CatalogPlacementReadModule` — the placement read that resolves the live
 *   Side and Area rows the frozen document is reconciled against;
 * - `CatalogModule` — for `PLACEMENT_HIERARCHY_PORT`, which the shared AGG-10
 *   repository requires. Nothing here creates a placement to satisfy a send: a
 *   Catalog identity that no longer resolves is the loud refusal
 *   `ADR-APP6-001` requires;
 * - `AuditModule` — the append-only `design_version.sent` evidence.
 *
 * What is **absent** bounds the checkpoint. There is no asset repository and no
 * object-storage client, so no preview can be rendered, stored or served. There
 * is no secure-grant issuer, no notification module and no step-up service:
 * `APP6-B10` uses the delivered `REQUEST_ACCESS` architecture unchanged, and
 * delivery of the outbox event is the delivered APP4 worker's, after commit.
 * There is no approval-snapshot repository and no agreement repository, so
 * nothing composed here can approve a design or publish terms. There is no
 * design-session write repository, so the submitted source a Catalog version was
 * authored from cannot be modified on this path.
 *
 * It exports nothing. There is one entry point and it is one HTTP operation.
 */
@Module({
  imports: [
    IdentityModule,
    DatabaseModule,
    CustomRequestDesignContextModule,
    OrderModule,
    CatalogPlacementReadModule,
    CatalogModule,
    AuditModule,
  ],
  controllers: [AdminCustomRequestDesignVersionSendController],
  providers: [
    SendDesignVersionUseCase,
    DesignVersionFreezeAuthority,
    DesignVersionSendRecorder,
    DesignVersionBranchResolver,
    FormalDesignVersionAuthority,
    SessionPlacementResolver,
    { provide: DESIGN_CASE_REPOSITORY, useClass: DrizzleDesignCaseRepository },
    {
      provide: SUBMITTED_DESIGN_PLACEMENT_PORT,
      useClass: DrizzleSubmittedDesignPlacementRepository,
    },
  ],
})
export class DesignVersionSendModule {}
