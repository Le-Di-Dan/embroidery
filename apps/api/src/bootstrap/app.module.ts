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
import { HealthModule } from '../modules/health/health.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { NotificationModule } from '../modules/notification/notification.module';
import { AuditContextModule } from '../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../platform/http-response/http-response.module';
import { LoggingModule } from '../platform/logging/logging.module';
import { RequestContextModule } from '../platform/request-context/request-context.module';
import { ValidationModule } from '../platform/validation/validation.module';

@Module({
  imports: [
    RequestContextModule,
    LoggingModule,
    AuditContextModule,
    HttpResponseModule,
    ValidationModule,
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
  ],
})
export class AppModule {}
