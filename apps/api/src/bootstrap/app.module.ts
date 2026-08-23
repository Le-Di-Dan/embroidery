import { Module } from '@nestjs/common';

import { AssetIntakeModule } from '../modules/asset/asset-intake.module';
import { CatalogDraftModule } from '../modules/catalog/catalog-draft.module';
import { DesignModule } from '../modules/design/design.module';
import { DesignTemplateAdminModule } from '../modules/design/design-template-admin.module';
import { DesignTemplateAssetPublicModule } from '../modules/design/design-template-asset-public.module';
import { DesignTemplatePublicModule } from '../modules/design/design-template-public.module';
import { CatalogAdminSideBackgroundModule } from '../modules/catalog/catalog-admin-side-background.module';
import { CatalogPlacementModule } from '../modules/catalog/catalog-placement.module';
import { CatalogSkuModule } from '../modules/catalog/catalog-sku.module';
import { CatalogPublicMediaModule } from '../modules/catalog/catalog-public-media.module';
import { CatalogPublicSideBackgroundModule } from '../modules/catalog/catalog-public-side-background.module';
import { CatalogPublicModule } from '../modules/catalog/catalog-public.module';
import { CatalogPublicationModule } from '../modules/catalog/catalog-publication.module';
import { CustomerModule } from '../modules/customer/customer.module';
import { CustomerAdminSupportModule } from '../modules/customer/customer-admin-support.module';
import { HealthModule } from '../modules/health/health.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { NotificationModule } from '../modules/notification/notification.module';
import { NotificationAdminModule } from '../modules/notification/notification-admin.module';
import { AdminOrderModule } from '../modules/order/admin-order.module';
import { CustomRequestIntakeModule } from '../modules/order/custom-request-intake.module';
import { CustomRequestAdminModule } from '../modules/order/custom-request-admin.module';
import { CustomRequestAssetDeliveryModule } from '../modules/order/custom-request-asset-delivery.module';
import { CustomRequestSubmittedDesignModule } from '../modules/order/custom-request-submitted-design.module';
import { DesignVersionAuthoringModule } from '../modules/design/design-version-authoring.module';
import { DesignVersionDetailReadModule } from '../modules/design/design-version-detail-read.module';
import { DesignVersionSendModule } from '../modules/design/design-version-send.module';
import { CustomRequestModerationModule } from '../modules/order/custom-request-moderation.module';
import { CustomRequestStatusModule } from '../modules/order/custom-request-status.module';
import { CustomRequestSubmissionModule } from '../modules/order/custom-request-submission.module';
import { QuotationDraftingModule } from '../modules/quotation/quotation-drafting.module';
import { QuotationReadModule } from '../modules/quotation/quotation-read.module';
import { QuotationSendModule } from '../modules/quotation/quotation-send.module';
import { CustomerQuotationDecisionModule } from '../modules/quotation/customer-quotation-decision.module';
import { CustomerQuotationModule } from '../modules/quotation/customer-quotation.module';
import { CustomerDesignDecisionModule } from '../modules/design/customer-design-decision.module';
import { CustomerDesignReviewModule } from '../modules/design/customer-design-review.module';
import { CustomerDepositModule } from '../modules/payment/customer-deposit.module';
import { CustomerDepositAttemptModule } from '../modules/payment/customer-deposit-attempt.module';
import { CustomerDepositEvidenceModule } from '../modules/payment/customer-deposit-evidence.module';
import { ContentModule } from '../modules/content/content.module';
import { AuditContextModule } from '../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../platform/http-response/http-response.module';
import { LoggingModule } from '../platform/logging/logging.module';
import { PolicyModule } from '../platform/policy/policy.module';
import { RequestContextModule } from '../platform/request-context/request-context.module';
import { ValidationModule } from '../platform/validation/validation.module';

@Module({
  imports: [
    RequestContextModule,
    LoggingModule,
    AuditContextModule,
    HttpResponseModule,
    ValidationModule,
    // APP4-B01-C1 — publishes the APP4-G01 policy dataset. Composed so the
    // `staff-bootstrap` CLI, which boots this module, can reach it with the
    // Admin id it just resolved. Publishes nothing on its own at startup.
    PolicyModule,
    HealthModule,
    IdentityModule,
    AssetIntakeModule,
    CatalogDraftModule,
    CatalogPublicationModule,
    CatalogPlacementModule,
    // `APP7-B01` — Admin SKU authoring, the inherited APP2 Catalog gap that leaves
    // the Catalog order-item branch unreachable. Registered beside the other
    // Admin catalog modules; its two routes differ from every other in segment
    // count and in the segment after `admin`, so registration order cannot make
    // one shadow another.
    CatalogSkuModule,
    // APP3-B02A — Admin Side background delivery, the JIT unblock for APP3-A01's
    // placement preview. Registered beside the placement module it serves and
    // before the public delivery module: the two share the `sides/.../background`
    // suffix but differ in base (`admin/products` vs `public/products`), so
    // neither can shadow the other.
    CatalogAdminSideBackgroundModule,
    CatalogPublicMediaModule,
    CatalogPublicSideBackgroundModule,
    // After the media and background modules purely for readability: all of them
    // share the `public/products` base path but their routes differ in segment
    // count, so registration order cannot make one shadow another.
    CatalogPublicModule,
    // APP3-B07 — the first production Design Session surface. Its config
    // requires DESIGN_SESSION_SECRET_PEPPER and fails loudly without it.
    DesignModule,
    DesignTemplateAdminModule,
    // APP3-B05 — the anonymous public Template reads. Registered after the Admin
    // module purely for readability: the two share no base path, so registration
    // order cannot make one shadow the other.
    DesignTemplatePublicModule,
    // APP3-B05A — published Template asset delivery. Registered after the JSON
    // reads it depends on for meaning, though not for wiring: its route shares
    // their base and adds four segments, so no registration order can make one
    // shadow another. Kept a separate module so the two JSON reads keep their
    // storage-free dependency closure.
    DesignTemplateAssetPublicModule,
    // APP4-B01 — notification intent intake. It publishes **no route**: it exists
    // so `APP4-B03`/`APP4-B05` have one place to ask for a delivery, and so the
    // `PENDING` outbox events `APP4-W01` will claim have a producer. Composed
    // last because nothing else depends on it, and registration order cannot
    // matter for a module with no controller.
    NotificationModule,
    // APP4-B02 — customer identity. Also **no route**: a customer exists only as
    // a side effect of a successful verification (`ADR-DB2-001` Option A), so the
    // resolution capability is exported for `APP4-B04` to call inside its own
    // transaction. Composed here because the module now has an application layer
    // to compose; the DB7 repositories it also provides were reachable by nothing
    // until this line existed.
    CustomerModule,
    // APP4-B07 — the Admin Customer and secure-grant support surface. A separate
    // module because `CustomerModule` above is the anonymous public stack and
    // holds no staff-auth dependency; this one imports `IdentityModule` for the
    // APP1 guards and `CustomerModule` for the repositories and the B05 grant
    // lifecycle it delegates every revocation to. Registered after both, though
    // not for wiring: `admin/customers` and `admin/secure-grants` share a base
    // path with no other module, so registration order cannot shadow anything.
    CustomerAdminSupportModule,
    // APP4-B08 — the Admin notification delivery surface and manual transport
    // replay. A separate module for the same reason the customer one above is:
    // `NotificationModule` is the anonymous intake path and holds no staff-auth
    // dependency, and B01's gate asserts that intake reaches no customer or
    // grant repository. Replay eligibility must reach both, so it is composed
    // here. Registered after `CustomerModule`, whose challenge and grant ports
    // it reads, though not for wiring — `admin/notification-intents` shares a
    // base path with no other module.
    NotificationAdminModule,
    // APP5-B01 — the request submission surface, and the first APP5 route. It
    // composes the accepted APP2/APP3/APP4 capabilities into the TR-LC11-01
    // transaction, so it is registered after every module it reads. Registration
    // order cannot shadow anything: `public/custom-requests` is a base path no
    // other module claims.
    CustomRequestSubmissionModule,
    // APP5-B02 — the pre-submission customer attachment lane. Registered after
    // the submission module because it exists to feed it, though not for
    // wiring: `public/custom-request-intake` is a base path no other module
    // claims, and the two share no provider instance.
    CustomRequestIntakeModule,
    // APP5-B03 — the grant-scoped customer read. Shares the `public/custom-requests`
    // base path with the submission module, which is safe and deliberate: the two
    // controllers claim disjoint routes (`POST ''` and `POST 'status'`), and Nest
    // matches the more specific segment regardless of registration order. Keeping
    // one base path is what lets both publish the `publicCustomRequest` domain.
    CustomRequestStatusModule,
    // APP5-B04 — the Admin request queue and detail. Registered after the three
    // public APP5 modules because it reports on what they create, though not for
    // wiring: `admin/custom-requests` is a base path no other module claims, and
    // it shares no provider instance with them.
    CustomRequestAdminModule,
    // APP5-B05 — the Admin moderation mutations. Shares the
    // `admin/custom-requests` base path with the read module, which is safe and
    // deliberate: the two controllers claim disjoint routes (`GET ''`/`GET
    // ':requestId'` against `POST ':requestId/moderation-notes'`/`POST
    // ':requestId/transitions'`). Keeping one base path is what lets both
    // publish the `adminCustomRequest` domain; keeping two modules is what keeps
    // the write repository out of the read surface's injector.
    CustomRequestModerationModule,
    // APP5-B06 — the one Admin binary read. Shares the `admin/custom-requests`
    // base path with the read and moderation modules, which is safe and
    // deliberate: its single route (`GET ':requestId/assets/:assetId/content'`)
    // is disjoint from both. It is a third module rather than a third controller
    // on either because it is the only one that needs an object-storage client,
    // and neither JSON surface may have one in reach.
    CustomRequestAssetDeliveryModule,
    // APP6-B01 — the first CTX-QUO HTTP surface: two Admin drafting mutations
    // on `admin/quotations`. Its own base path, disjoint from every module
    // above, so registration order cannot make one shadow another.
    QuotationDraftingModule,
    // APP6-B02 — the Admin quotation reads, on the same base path. Two GETs
    // beside two POSTs: Nest matches on method as well as path, so the read of
    // `:quotationId/versions` and the append to it never contend, and keeping
    // them in separate modules is what stops the read surface from holding a
    // transaction manager.
    QuotationReadModule,
    // APP6-B03 — the Admin quotation send, on the same base path. Its route is
    // `:quotationId/versions/:versionId/send`, a longer literal path than any
    // handler in the two modules above, so no ordering makes one shadow it; it
    // is a third module because it is the only APP6 surface allowed to move a
    // custom request.
    QuotationSendModule,
    // APP6-B04 — the customer's grant-scoped quotation read, on its own
    // `public/quotations` base path. Disjoint from the three Admin quotation
    // modules above and from every public module before it, so registration
    // order cannot make one shadow another. It is a fourth quotation module
    // because it is the only one an unauthenticated caller reaches, and the only
    // one that must hold no transaction manager and no write repository.
    CustomerQuotationModule,
    // APP6-B05 — the customer's two quotation decisions, on the same
    // `public/quotations` base path with two distinct sub-paths (`accept`,
    // `reject`), disjoint from `current` above. A fifth quotation module
    // because it is the mirror image of the fourth: these are the writes, so it
    // holds the transaction manager, the idempotency store, the request
    // repository and the audit repository that the read is defined by not
    // holding. `CONTROLLER_DOMAIN_KEYS` keeps both publishing `publicQuotation`.
    CustomerQuotationDecisionModule,
    // APP6-B07 — the Admin submitted-design read. A fourth module on the
    // `admin/custom-requests` base path, and its single route
    // (`GET ':requestId/submitted-design'`) is disjoint from every handler in
    // the three APP5 modules above, so no registration order makes one shadow
    // another. It is a fourth module because it is the only one holding a
    // Design port, and neither the two JSON reads nor the two moderation writes
    // may have one in reach.
    CustomRequestSubmittedDesignModule,
    DesignVersionAuthoringModule,
    DesignVersionDetailReadModule,
    DesignVersionSendModule,
    // APP6-B10 — CTX-CNT, composed so the `staff-bootstrap` CLI can reach
    // `PublishApp6AgreementsUseCase` with the Admin id it just resolved. It
    // declares no controller, so registering it publishes no route and
    // publishes nothing at startup on its own.
    ContentModule,
    // APP6-B10 — the customer's grant-scoped design review read, on its own
    // `public/design-reviews` base path. Disjoint from every module before it,
    // so registration order cannot make one shadow another. Like
    // `CustomerQuotationModule` it is defined by what it cannot inject: no
    // transaction manager, no write repository, no storage port and no
    // agreement publisher.
    CustomerDesignReviewModule,
    // APP6-B11 — the customer's two design decisions, on the same
    // `public/design-reviews` base path with two distinct sub-paths (`approve`,
    // `request-revision`), disjoint from `current` above. A second design-review
    // module because it is the mirror image of the first: these are the writes,
    // so it holds the transaction manager, the idempotency store, the AGG-10 and
    // AGG-11 write repositories, the request repository, the audit repository
    // and the outbox that the read is defined by not holding.
    // `CONTROLLER_DOMAIN_KEYS` keeps both publishing `publicDesignReview`.
    CustomerDesignDecisionModule,
    // APP7-B02 — the Admin order queue and detail, on its own `admin/orders`
    // base path. Disjoint from every module above, so registration order cannot
    // make one shadow another. Like `CustomRequestAdminModule` it is defined by
    // what it cannot inject: no `OrderModule`, so `ORDER_REPOSITORY` and the
    // canonical `OrderChainGuard` `APP7-W01-C1` consolidated are out of reach of
    // both routes, and no Catalog or Customer port, so a frozen order fact
    // cannot be reconstructed from live state by accident.
    AdminOrderModule,
    // APP7-B03 — the customer's two zero-write deposit operations, on their own
    // `public/orders` base path. Disjoint from `admin/orders` above and from
    // every public module before it, so registration order cannot make one
    // shadow another. Like `CustomerQuotationModule` it is defined by what it
    // cannot inject: no `DatabaseModule`, so no transaction manager and no
    // idempotency store; no `OrderModule`, so no LC-14 transition; no asset or
    // storage module, so the QR is generated in-process and nothing is stored.
    // Its merchant bank configuration is read by a factory, so a deployment
    // missing one of the four values fails at composition rather than at the
    // first customer request.
    CustomerDepositModule,
    // APP7-B03 — the customer's one deposit write, on the same `public/orders`
    // base path with a distinct sub-path (`deposit/attempts`), disjoint from
    // `deposit` and `deposit/qr` above. A second deposit module because it is
    // the mirror image of the first: it holds the transaction manager, the
    // idempotency store and the canonical AGG-16 repository that the read is
    // defined by not holding. `CONTROLLER_DOMAIN_KEYS` keeps both publishing
    // `publicOrderDeposit`.
    CustomerDepositAttemptModule,
    // APP7-B05 — the customer transfer-evidence lane, on the same `public/orders`
    // base path with a distinct sub-path (`deposit/evidence`), disjoint from the
    // three above. A third deposit module because it is the only one that needs a
    // configured object store and the delivered intake pipeline, and the only one
    // that writes `payment_transfer_evidence`. It publishes its own
    // `publicOrderDepositEvidence` domain — an intake lane is its own domain, on
    // the precedent `CONTROLLER_DOMAIN_KEYS` already records for
    // `PublicCustomRequestAssetController`.
    CustomerDepositEvidenceModule,
  ],
})
export class AppModule {}
