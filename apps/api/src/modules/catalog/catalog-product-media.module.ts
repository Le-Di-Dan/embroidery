import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogModule } from './catalog.module';
import { ProductMediaSelection } from './application/product-media-selection.service';
import { ReplaceProductMediaUseCase } from './application/replace-product-media.use-case';
import { PRODUCT_DRAFT_REPOSITORY } from './domain/repositories/product-draft.repository';
import { PRODUCT_PUBLICATION_REPOSITORY } from './domain/repositories/product-publication.repository';
import { DrizzleProductDraftRepository } from './infrastructure/persistence/drizzle-product-draft.repository';
import { DrizzleProductPublicationRepository } from './infrastructure/persistence/drizzle-product-publication.repository';
import { AdminProductMediaController } from './presentation/admin-product-media.controller';

/**
 * The bounded Product media-curation feature (`APP12-M01.B2`).
 *
 * Its own module for the same reason `CatalogDraftModule` and
 * `CatalogPublicationModule` are separate from each other and from
 * `CatalogModule`: this one is the single seam permitted to write
 * `product_media` while a Product is `PUBLISHED`, and a reviewer should be able
 * to see everything that seam can reach in one file. What it can reach is
 * exactly two persistence ports and the Asset boundary — no Audit recorder, no
 * Outbox, no SKU, inventory, shipping, payment, order or Gallery dependency, so
 * a media write is structurally incapable of touching a commercial fact.
 *
 * `ProductPublicationRepository` supplies the locked snapshot — the Product
 * `FOR UPDATE`, its category and current media `FOR SHARE` — reused rather than
 * reimplemented, so a media curation and a publish racing over one Product
 * serialise on the same row lock.
 *
 * `AssetModule` is imported for its **public** repository port: the selection is
 * validated through that boundary, never by reading the asset tables, so the
 * association stays Catalog's and the asset metadata stays Asset's
 * (ADR-DB4-003).
 */
@Module({
  imports: [DatabaseModule, CatalogModule, AssetModule, IdentityModule],
  controllers: [AdminProductMediaController],
  providers: [
    { provide: PRODUCT_DRAFT_REPOSITORY, useClass: DrizzleProductDraftRepository },
    { provide: PRODUCT_PUBLICATION_REPOSITORY, useClass: DrizzleProductPublicationRepository },
    ProductMediaSelection,
    ReplaceProductMediaUseCase,
  ],
})
export class CatalogProductMediaModule {}
