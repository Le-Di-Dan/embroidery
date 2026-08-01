import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductPublicationRecorder } from './application/product-publication.recorder';
import { ProductPublicationService } from './application/product-publication.service';
import { PRODUCT_PUBLICATION_REPOSITORY } from './domain/repositories/product-publication.repository';
import { DrizzleProductPublicationRepository } from './infrastructure/persistence/drizzle-product-publication.repository';
import { AdminProductPublicationController } from './presentation/admin-product-publication.controller';

/**
 * The Admin product publication feature (`APP2-B03`).
 *
 * Kept separate from `CatalogDraftModule` for the same reason that one is kept
 * separate from `CatalogModule`: publication has its own repository, its own
 * controller and its own dependencies — the Audit repository and the platform
 * Outbox store, neither of which draft management needs.
 *
 * `AssetModule` is imported for its **public** repository port. Publication
 * re-validates every attached image and its derivatives through that boundary
 * rather than reading the asset tables, so the association stays Catalog's and
 * the asset metadata stays Asset's (ADR-DB4-003).
 *
 * `DatabaseModule` supplies `TransactionManager` and `OutboxEventStore`; the
 * audit clock and request context come from their global platform modules.
 */
@Module({
  imports: [DatabaseModule, AssetModule, AuditModule, IdentityModule],
  controllers: [AdminProductPublicationController],
  providers: [
    { provide: PRODUCT_PUBLICATION_REPOSITORY, useClass: DrizzleProductPublicationRepository },
    ProductPublicationRecorder,
    ProductPublicationService,
  ],
})
export class CatalogPublicationModule {}
