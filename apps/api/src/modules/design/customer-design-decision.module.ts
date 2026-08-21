import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../platform/request-context/request-context.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomRequestApprovalFactsModule } from '../order/custom-request-approval-facts.module';
import { CustomRequestDesignContextModule } from '../order/custom-request-design-context.module';
import { OrderModule } from '../order/order.module';
import { DesignReviewReadModule } from './design-review-read.module';
import { AcceptedTermsAuthority } from './application/deciding/accepted-terms.authority';
import { ApprovalEvidenceResolver } from './application/deciding/approval-evidence.resolver';
import { ApproveDesignVersionUseCase } from './application/deciding/approve-design-version.use-case';
import { DesignDecisionRecorder } from './application/deciding/design-decision.recorder';
import { DesignDecisionTargetResolver } from './application/deciding/design-decision.target';
import { RequestDesignRevisionUseCase } from './application/deciding/request-design-revision.use-case';
import { APPROVAL_SNAPSHOT_REPOSITORY } from './domain/repositories/approval-snapshot.repository';
import { DESIGN_CASE_REPOSITORY } from './domain/repositories/design-case.repository';
import { DrizzleApprovalSnapshotRepository } from './infrastructure/persistence/drizzle-approval-snapshot.repository';
import { DrizzleDesignCaseRepository } from './infrastructure/persistence/drizzle-design-case.repository';
import { PublicDesignReviewDecisionController } from './presentation/public-design-review-decision.controller';

/**
 * `APP6-B11` — the customer's two grant-scoped design decisions.
 *
 * The mirror image of `CustomerDesignReviewModule`, assembled on exactly the
 * arrangement `CustomerQuotationModule` / `CustomerQuotationDecisionModule`
 * established one lane over: the read module is *defined* by holding no
 * transaction manager and no write repository, and these two routes need both.
 *
 * ### Why not simply widen `CustomerDesignReviewModule`
 *
 * Because that module's documented security property is an **absence**. It
 * imports no `DatabaseModule`, so nothing composed there can open a transaction;
 * no `DesignModule`, so `DESIGN_CASE_REPOSITORY` is out of reach; no
 * `OrderModule`, so no route can transition a request. Merging these writes in
 * would delete every one of those claims to gain nothing — the read and the two
 * writes share no provider — and would leave one module whose injector explains
 * neither surface. `CONTROLLER_DOMAIN_KEYS` keeps both halves publishing one
 * `publicDesignReview` domain, so the split costs the contract nothing.
 *
 * ### What this module may inject, which is what its routes may eventually do
 *
 * - `CustomerModule` — three capabilities and no machinery.
 *   `AuthorizeSecureLink` for the pre-transaction admission (identical policy,
 *   budget and digest to B10's read); `ReauthorizeSecureGrant` for the
 *   in-transaction, row-locked re-check ADR-DB3-004 r9 requires (CC-16); and
 *   `StepUpEvidenceResolver` for GRD-003. It also exports `CUSTOMER_REPOSITORY`,
 *   which the evidence resolver reads the frozen contact copy through — the raw
 *   contact, deliberately, because `contact_email`/`contact_phone` are evidence
 *   of how the customer was reachable and a masked projection would freeze
 *   asterisks. It issues nothing: B11 reuses the `REQUEST_ACCESS` grant APP5
 *   created at submission and mints no token, no scope kind and no second
 *   secure-link architecture. The pepper provider, the token minter, the grant
 *   issuer, the rate limiter and the notification module all stay out of reach;
 * - `CustomRequestDesignContextModule` — the read-only Ordering port that locks
 *   the request row and carries its design-case pointer;
 * - `CustomRequestApprovalFactsModule` — the second read-only Ordering port, for
 *   the quantity total and the customer-owned product's own name. Narrow so the
 *   evidence resolver cannot rewrite the breakdown whose total it freezes;
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, for the **approval** half only:
 *   the `TR-LC11-09` projection. The revision use case does not inject it, which
 *   is what makes "a revision request does not move the request" structural
 *   rather than remembered;
 * - `DesignReviewReadModule` — `EffectiveAgreementsReader` and the policy
 *   reader, so GRD-008 is re-evaluated inside the approval transaction against
 *   the same authority B10 published the set from. That module absorbs
 *   `ContentModule` without re-exporting it, so `AGREEMENT_REPOSITORY` stays out
 *   of reach and no route here can publish or withdraw a term;
 * - `CatalogModule` — `CATALOG_SUBJECT_PORT` for the frozen product and variant
 *   labels, and `PLACEMENT_HIERARCHY_PORT`, which the AGG-11 repository requires
 *   for G-DB7-13. Nothing here creates a placement to satisfy an approval;
 * - `CatalogPlacementReadModule` — `PRODUCT_PLACEMENT_REPOSITORY`, for the Side
 *   and Area names the snapshot freezes. The read side only: no side or area can
 *   be created, edited or retired from this injector;
 * - `DatabaseModule` — `TransactionManager`, `IdempotencyStore` and
 *   `OutboxEventStore`. The delivered claim mechanism and the delivered outbox,
 *   not parallel ones;
 * - `AuditModule` — the append-only audit repository, for the two decision rows;
 * - `AuditContextModule` and `RequestContextModule` — the injectable clock and
 *   the correlation id the audit rows and the transition all carry.
 *
 * The two AGG-10 and AGG-11 repositories are provided here directly rather than
 * by importing `DesignModule`, on the `DesignVersionSendModule` precedent: that
 * module declares four public Design Session controllers and exports the Session
 * guard's whole dependency closure, none of which a decision surface needs, and
 * importing it to reach two repositories would boot every one of them.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no order-creation, payment, inventory or production module, so
 * APP7's work is **unreachable** from an approval rather than merely undone —
 * `design.approved` is written to the outbox and this transaction ends. There is
 * no `AssetModule`, no `ObjectStorageModule` and no image pipeline, so no byte,
 * storage key, provider URL or raster is reachable at all. There is no secure
 * grant issuer and no notification module, so no approval can mint a link or
 * deliver a message. There is no `DesignVersionAuthoringModule` and no
 * `DesignVersionSendModule`, so no Admin mutation is reachable from a public
 * controller and a revision request cannot author the next draft. There is no
 * `ContentModule`, so no agreement can be published, superseded or withdrawn by
 * the transaction that binds it.
 *
 * It exports nothing. There are two entry points and they are the HTTP
 * operations.
 */
@Module({
  imports: [
    AuditContextModule,
    RequestContextModule,
    AuditModule,
    CatalogModule,
    CatalogPlacementReadModule,
    CustomerModule,
    CustomRequestApprovalFactsModule,
    CustomRequestDesignContextModule,
    DatabaseModule,
    DesignReviewReadModule,
    OrderModule,
  ],
  controllers: [PublicDesignReviewDecisionController],
  providers: [
    DesignDecisionTargetResolver,
    AcceptedTermsAuthority,
    ApprovalEvidenceResolver,
    DesignDecisionRecorder,
    ApproveDesignVersionUseCase,
    RequestDesignRevisionUseCase,
    { provide: DESIGN_CASE_REPOSITORY, useClass: DrizzleDesignCaseRepository },
    { provide: APPROVAL_SNAPSHOT_REPOSITORY, useClass: DrizzleApprovalSnapshotRepository },
  ],
})
export class CustomerDesignDecisionModule {}
