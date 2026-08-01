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

/**
 * APP2-B01 — the Admin asset-intake feature: upload, detail, list.
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
  controllers: [AdminAssetController],
  providers: [
    ObjectStorageBootstrapService,
    UploadTimer,
    UploadReclaimService,
    UploadTransactionsService,
    AssetIntakeService,
    AssetCatalogQuery,
  ],
  // Exported for the production startup sequence in `main.ts`, which must
  // verify the private buckets before the port opens (APP2-I03).
  exports: [ObjectStorageBootstrapService],
})
export class AssetIntakeModule {}
