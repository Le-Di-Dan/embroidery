import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { PUBLIC_SIDE_BACKGROUND_REPOSITORY } from './domain/repositories/public-side-background.repository';
import { DrizzlePublicSideBackgroundRepository } from './infrastructure/persistence/drizzle-public-side-background.repository';
import { PublicSideBackgroundService } from './application/public-side-background.service';
import { PublicProductSideBackgroundController } from './presentation/public-product-side-background.controller';

/**
 * `APP3-B02` — public Product Side background delivery.
 *
 * One anonymous binary route, in its own module for exactly the reasons
 * `CatalogPublicMediaModule` is: the Admin placement surface carries
 * authentication, the Origin allowlist and audit wiring, and a public read has
 * no business sharing a graph with them. Separating them also means a test for
 * this route stands up a database and a storage port and nothing else.
 *
 * `ObjectStorageModule` supplies the port. The module holds no bucket bootstrap:
 * creating buckets is the asset feature's startup concern (`APP2-I03`), and a
 * read path must not be able to create anything.
 *
 * Deliberately absent: any upload, any mutation, any Template or Session route,
 * any asset-by-id or derivative-by-id route, and any presign capability.
 */
@Module({
  imports: [DatabaseModule, ObjectStorageModule],
  controllers: [PublicProductSideBackgroundController],
  providers: [
    { provide: PUBLIC_SIDE_BACKGROUND_REPOSITORY, useClass: DrizzlePublicSideBackgroundRepository },
    PublicSideBackgroundService,
  ],
})
export class CatalogPublicSideBackgroundModule {}
