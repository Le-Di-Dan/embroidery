import { Module } from '@nestjs/common';

import { AssetIntakeModule } from '../modules/asset/asset-intake.module';
import { CatalogDraftModule } from '../modules/catalog/catalog-draft.module';
import { DesignModule } from '../modules/design/design.module';
import { DesignTemplateAdminModule } from '../modules/design/design-template-admin.module';
import { DesignTemplateAssetPublicModule } from '../modules/design/design-template-asset-public.module';
import { DesignTemplatePublicModule } from '../modules/design/design-template-public.module';
import { CatalogAdminSideBackgroundModule } from '../modules/catalog/catalog-admin-side-background.module';
import { CatalogPlacementModule } from '../modules/catalog/catalog-placement.module';
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
import { CustomRequestIntakeModule } from '../modules/order/custom-request-intake.module';
import { CustomRequestAdminModule } from '../modules/order/custom-request-admin.module';
import { CustomRequestAssetDeliveryModule } from '../modules/order/custom-request-asset-delivery.module';
import { CustomRequestModerationModule } from '../modules/order/custom-request-moderation.module';
import { CustomRequestStatusModule } from '../modules/order/custom-request-status.module';
import { CustomRequestSubmissionModule } from '../modules/order/custom-request-submission.module';
import { QuotationDraftingModule } from '../modules/quotation/quotation-drafting.module';
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
  ],
})
export class AppModule {}
