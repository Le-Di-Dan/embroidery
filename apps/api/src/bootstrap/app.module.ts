import { Module } from '@nestjs/common';

import { AssetIntakeModule } from '../modules/asset/asset-intake.module';
import { CatalogDraftModule } from '../modules/catalog/catalog-draft.module';
import { CatalogPlacementModule } from '../modules/catalog/catalog-placement.module';
import { CatalogPublicMediaModule } from '../modules/catalog/catalog-public-media.module';
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
    // After the media module purely for readability: the two share the
    // `public/products` base path but their routes differ in segment count, so
    // registration order cannot make one shadow the other.
    CatalogPublicModule,
  ],
})
export class AppModule {}
