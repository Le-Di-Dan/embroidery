import { Module } from '@nestjs/common';

import { AssetIntakeModule } from '../modules/asset/asset-intake.module';
import { CatalogDraftModule } from '../modules/catalog/catalog-draft.module';
import { DesignModule } from '../modules/design/design.module';
import { CatalogPlacementModule } from '../modules/catalog/catalog-placement.module';
import { CatalogPublicMediaModule } from '../modules/catalog/catalog-public-media.module';
import { CatalogPublicSideBackgroundModule } from '../modules/catalog/catalog-public-side-background.module';
import { CatalogPublicModule } from '../modules/catalog/catalog-public.module';
import { CatalogPublicationModule } from '../modules/catalog/catalog-publication.module';
import { HealthModule } from '../modules/health/health.module';
import { IdentityModule } from '../modules/identity/identity.module';
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
    CatalogPublicMediaModule,
    CatalogPublicSideBackgroundModule,
    // After the media and background modules purely for readability: all of them
    // share the `public/products` base path but their routes differ in segment
    // count, so registration order cannot make one shadow another.
    CatalogPublicModule,
    // APP3-B07 — the first production Design Session surface. Its config
    // requires DESIGN_SESSION_SECRET_PEPPER and fails loudly without it.
    DesignModule,
  ],
})
export class AppModule {}
