import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { ADMIN_SIDE_BACKGROUND_REPOSITORY } from './domain/repositories/admin-side-background.repository';
import { DrizzleAdminSideBackgroundRepository } from './infrastructure/persistence/drizzle-admin-side-background.repository';
import { AdminSideBackgroundService } from './application/admin-side-background.service';
import { AdminProductSideBackgroundController } from './presentation/admin-product-side-background.controller';

/**
 * `APP3-B02A` — Admin Product Side background delivery.
 *
 * One authenticated binary route, in its own module for the same reason
 * `CatalogPublicSideBackgroundModule` is separate: a delivery path should stand
 * up a database, a storage port and an auth boundary, and nothing else. Keeping
 * it apart from `CatalogPlacementModule` also means this route cannot
 * accidentally acquire the placement service's write capability.
 *
 * `IdentityModule` supplies `AuthenticatedAdminGuard`'s dependencies.
 * `ObjectStorageModule` supplies the port. The module holds no bucket
 * bootstrap: creating buckets is the asset feature's startup concern
 * (`APP2-I03`), and a read path must not be able to create anything.
 *
 * Deliberately absent: any upload, any mutation, any placement or Product write,
 * any Template or Session route, any asset-by-id or derivative-by-id route, and
 * any presign capability.
 */
@Module({
  imports: [DatabaseModule, ObjectStorageModule, IdentityModule],
  controllers: [AdminProductSideBackgroundController],
  providers: [
    { provide: ADMIN_SIDE_BACKGROUND_REPOSITORY, useClass: DrizzleAdminSideBackgroundRepository },
    AdminSideBackgroundService,
  ],
})
export class CatalogAdminSideBackgroundModule {}
