import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { IdentityModule } from '../identity/identity.module';
import { AdminGalleryAssetPreparationService } from './application/admin-gallery-asset-preparation.service';
import { AdminGalleryAssetPreviewService } from './application/admin-gallery-asset-preview.service';
import { GalleryAssetObjectCopier } from './application/gallery-asset-object-copier';
import { AdminGalleryAssetController } from './presentation/admin-gallery-asset.controller';

/**
 * `APP11-B03A` — Admin gallery media preparation and preview.
 *
 * A fourth Gallery module rather than a third controller on `GalleryAdminModule`,
 * and the boundary is the reason: this is the only Gallery surface holding the
 * **Asset write port** and a configured object store. `GalleryAdminModule` was
 * accepted on holding neither — its stated property is that no route there can
 * mint a public URL, register a derivative or touch a stored object — and
 * putting `ASSET_REPOSITORY` and `OBJECT_STORAGE` into that graph would retract
 * exactly that guarantee for the seven authoring and publication operations.
 *
 * What this module holds, and why each is the narrowest thing that works:
 *
 * - `AssetModule` for `ASSET_REPOSITORY`, the AGG-08 published port. Gallery
 *   never touches an asset table itself, and there is exactly one Asset
 *   persistence implementation in the process (`BACKEND_CONVENTIONS.md` §10).
 * - `ObjectStorageModule` for the shared port, so one S3 client serves the
 *   whole process. No bucket bootstrap: creating buckets is the asset feature's
 *   startup concern (`APP2-I03`), and a preparation path must not create one.
 * - `IdentityModule` for the three delivered staff guards.
 *
 * Deliberately absent: `GalleryModule` and both AGG-18 write ports. Preparation
 * produces an asset; it does not attach one, and no route here can edit a
 * curated selection or move an entry's lifecycle. That is `APP11-B02`'s, and
 * keeping the ports apart is what makes the separation checkable rather than
 * merely intended.
 */
@Module({
  imports: [DatabaseModule, AssetModule, ObjectStorageModule, IdentityModule],
  controllers: [AdminGalleryAssetController],
  providers: [
    GalleryAssetObjectCopier,
    AdminGalleryAssetPreparationService,
    AdminGalleryAssetPreviewService,
  ],
})
export class GalleryAdminMediaModule {}
