import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { AssetModule } from './asset.module';
import { ObjectStorageModule } from './infrastructure/storage/object-storage.module';
import { ObjectStorageBootstrapService } from './infrastructure/storage/object-storage-bootstrap.service';
import { AssetIntakeService } from './application/asset-intake.service';
import { AssetCatalogQuery } from './application/asset-catalog.query';
import { UploadReclaimService } from './application/upload-reclaim.service';
import { UploadTransactionsService } from './application/upload-transactions.service';
import { UploadTimer } from './application/ports/upload-timer';
import { AdminAssetController } from './presentation/admin-asset.controller';
import { AdminAssetPreviewController } from './presentation/admin-asset-preview.controller';
import { AdminAssetPreviewService } from './application/admin-asset-preview.service';

/**
 * APP2-B01 — the Admin asset-intake feature: upload, detail, list, preview.
 *
 * Separate from `AssetModule` so the persistence contract stays usable on its
 * own. This module is where the HTTP surface, the object-storage binding and
 * the idempotency state machine live, and it is the only place that needs
 * authentication and a configured object store.
 *
 * `IdentityModule` is imported for its exported `AuthenticatedAdminGuard` and
 * `StaffOriginGuard` rather than re-implementing authentication: those guards
 * own session resolution, renewal, revocation, actor binding and the exact
 * Origin allowlist for every route here.
 */
@Module({
  imports: [DatabaseModule, AssetModule, IdentityModule, ObjectStorageModule],
  controllers: [AdminAssetController, AdminAssetPreviewController],
  providers: [
    ObjectStorageBootstrapService,
    UploadTimer,
    UploadReclaimService,
    UploadTransactionsService,
    AssetIntakeService,
    AssetCatalogQuery,
    AdminAssetPreviewService,
  ],
  // Exported for the production startup sequence in `main.ts`, which must
  // verify the private buckets before the port opens (APP2-I03).
  exports: [ObjectStorageBootstrapService],
})
export class AssetIntakeModule {}
