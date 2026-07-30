import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogModule } from './catalog.module';
import { CategoryResolver } from './application/category-resolver.service';
import { ProductDraftQuery } from './application/product-draft.query';
import { ProductDraftService } from './application/product-draft.service';
import { ProductMediaSelection } from './application/product-media-selection.service';
import { PRODUCT_DRAFT_REPOSITORY } from './domain/repositories/product-draft.repository';
import { DrizzleProductDraftRepository } from './infrastructure/persistence/drizzle-product-draft.repository';
import { AdminProductController } from './presentation/admin-product.controller';

/**
 * The Admin product-draft feature (`APP2-B02`).
 *
 * Kept separate from `CatalogModule`, which is the DB7 persistence module that
 * Design, Approval and Production already import for the placement hierarchy.
 * A suite that only exercises those repositories should not have to stand up
 * authentication and a controller to do it — the same split `AssetModule` and
 * `AssetIntakeModule` already use.
 *
 * `AssetModule` is imported for its **public** repository port: the media
 * selection validates each chosen Asset through that boundary rather than
 * reading the asset tables, so the association stays Catalog's and the asset
 * metadata stays Asset's (ADR-DB4-003).
 */
@Module({
  imports: [DatabaseModule, CatalogModule, AssetModule, IdentityModule],
  controllers: [AdminProductController],
  providers: [
    { provide: PRODUCT_DRAFT_REPOSITORY, useClass: DrizzleProductDraftRepository },
    CategoryResolver,
    ProductMediaSelection,
    ProductDraftService,
    ProductDraftQuery,
  ],
})
export class CatalogDraftModule {}
