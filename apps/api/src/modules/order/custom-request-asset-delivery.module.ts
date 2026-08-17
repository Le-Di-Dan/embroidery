import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { IdentityModule } from '../identity/identity.module';
import { DeliverRequestAsset } from './application/admin/deliver-request-asset.use-case';
import { REQUEST_ASSET_DELIVERY_REPOSITORY } from './domain/repositories/request-asset-delivery.repository';
import { DrizzleRequestAssetDeliveryRepository } from './infrastructure/persistence/drizzle-request-asset-delivery.repository';
import { AdminCustomRequestAssetController } from './presentation/admin-custom-request-asset.controller';

/**
 * `APP5-B06` — Admin delivery of submitted request evidence.
 *
 * A **sixth** APP5 module beside submission, intake, the customer status read,
 * the Admin read model and the moderation writes, on the pattern the five before
 * it set: one surface, one injector, one set of dependencies.
 *
 * The split from `CustomRequestAdminModule` is not cosmetic. This is the only
 * APP5 module that needs `ObjectStorageModule`, and folding it in would put an
 * S3 client into the injector of two JSON read routes that must never open an
 * object — and would make `getObjectStream` resolvable from a controller whose
 * whole contract is that it publishes no binary. The reverse containment matters
 * too: this module deliberately does **not** import `CustomRequestAdminModule`
 * or `OrderModule`, so the queue query, the detail query and `transition()` are
 * all unreachable from a route that must only read.
 *
 * Its dependencies are exactly four, and each is a boundary rather than a
 * convenience:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `AssetModule` — `ASSET_REPOSITORY` only, for the source descriptor. Asset
 *   keeps owning the file; Ordering owns the association;
 * - `ObjectStorageModule` — the shared `ObjectStoragePort` binding, so exactly
 *   one S3 client is built for the process;
 * - `DatabaseModule` — the executor the association read is built on. No
 *   `TransactionManager` is used: there is nothing to commit, and no storage I/O
 *   ever happens inside a transaction.
 *
 * It exports nothing. There is one entry point and it is an HTTP operation.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, AssetModule, ObjectStorageModule],
  controllers: [AdminCustomRequestAssetController],
  providers: [
    {
      provide: REQUEST_ASSET_DELIVERY_REPOSITORY,
      useClass: DrizzleRequestAssetDeliveryRepository,
    },
    DeliverRequestAsset,
  ],
})
export class CustomRequestAssetDeliveryModule {}
