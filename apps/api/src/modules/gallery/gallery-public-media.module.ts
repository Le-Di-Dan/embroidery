import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { PUBLIC_GALLERY_MEDIA_REPOSITORY } from './domain/repositories/public-gallery-media.repository';
import { DrizzlePublicGalleryMediaRepository } from './infrastructure/persistence/drizzle-public-gallery-media.repository';
import { PublicGalleryMediaService } from './application/public-gallery-media.service';
import { PublicGalleryEntryAssetController } from './presentation/public-gallery-entry-asset.controller';

/**
 * `APP11-B03` — public gallery-media delivery.
 *
 * One anonymous binary route, kept in its own module for the reason
 * `CatalogPublicMediaModule` states and this surface repeats exactly: the Admin
 * gallery modules carry authentication, the Origin allowlist and the guarded
 * publication writer, and a public route has no business sharing a graph with
 * them. Separating it also means a test for this route stands up a database and
 * a storage port and nothing else.
 *
 * `ObjectStorageModule` supplies the port. The module holds no bucket
 * bootstrap: creating buckets is the asset feature startup concern
 * (`APP2-I03`), and a read path must not be able to create anything.
 *
 * Deliberately absent: the two JSON reads, every Admin gallery route, any
 * asset-by-id or derivative-by-id route, and any Storefront concern.
 */
@Module({
  imports: [DatabaseModule, ObjectStorageModule],
  controllers: [PublicGalleryEntryAssetController],
  providers: [
    { provide: PUBLIC_GALLERY_MEDIA_REPOSITORY, useClass: DrizzlePublicGalleryMediaRepository },
    PublicGalleryMediaService,
  ],
})
export class GalleryPublicMediaModule {}
