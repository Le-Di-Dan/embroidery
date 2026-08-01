import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { PUBLIC_PRODUCT_MEDIA_REPOSITORY } from './domain/repositories/public-product-media.repository';
import { DrizzlePublicProductMediaRepository } from './infrastructure/persistence/drizzle-public-product-media.repository';
import { PublicProductMediaService } from './application/public-product-media.service';
import { PublicProductMediaController } from './presentation/public-product-media.controller';

/**
 * `APP2-T01` — the public catalog-media delivery foundation.
 *
 * One anonymous binary route, kept in its own module rather than added to
 * `CatalogDraftModule` or `CatalogPublicationModule`: those two are the Admin
 * surface and carry authentication, the Origin allowlist and audit wiring, and
 * a public route has no business sharing a graph with them. Separating them
 * also means a test for this route stands up a database and a storage port and
 * nothing else.
 *
 * `ObjectStorageModule` supplies the port. The module holds no bucket
 * bootstrap: creating buckets is the asset feature's startup concern
 * (`APP2-I03`), and a read path must not be able to create anything.
 *
 * Deliberately absent: the B04 JSON list/detail operations, any Admin media
 * route, any asset-by-id or derivative-by-id route, and any Storefront concern.
 */
@Module({
  imports: [DatabaseModule, ObjectStorageModule],
  controllers: [PublicProductMediaController],
  providers: [
    { provide: PUBLIC_PRODUCT_MEDIA_REPOSITORY, useClass: DrizzlePublicProductMediaRepository },
    PublicProductMediaService,
  ],
})
export class CatalogPublicMediaModule {}
