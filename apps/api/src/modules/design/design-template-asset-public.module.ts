import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY } from './domain/repositories/public-design-template-asset.repository';
import { DrizzlePublicDesignTemplateAssetRepository } from './infrastructure/persistence/drizzle-public-design-template-asset.repository';
import { PublicDesignTemplateAssetService } from './application/public-design-template-asset.service';
import { PublicDesignTemplateAssetController } from './presentation/public-design-template-asset.controller';

/**
 * The one published Template asset delivery route (`APP3-B05A`).
 *
 * Its own module rather than a fourth provider inside `DesignTemplatePublicModule`.
 * That module deliberately imports no object storage — its docblock says so, and
 * says why: two JSON reads have no business holding a storage port. Adding one to
 * it would give both anonymous reads a capability neither uses, and would make
 * "this surface cannot reach bytes" a comment instead of a fact.
 *
 * Three imports, and each is load-bearing:
 *
 * - `DatabaseModule` for the executor the read adapter needs.
 * - `CatalogPlacementReadModule` for the placement **port** — the same
 *   controller-free read boundary `APP3-B05`, `APP3-B07` and `APP3-B08` already
 *   use. Design asks Catalog whether a scope is still publicly designable; it
 *   never re-derives the answer and never touches a Catalog table.
 * - `ObjectStorageModule` for the port that opens the private object. It carries
 *   no bucket bootstrap: creating buckets is the asset feature's startup concern
 *   (`APP2-I03`), and a read path must not be able to create anything.
 *
 * ## The zero-write guarantee is structural
 *
 * This module binds `PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY` — one method, a
 * read — and **not** `DESIGN_TEMPLATE_REPOSITORY`. There is no `attachAsset`, no
 * `publishVersion`, no `saveDraftVersion` reachable from this route at all.
 * There is likewise no `AuditModule` and no outbox dependency to append with, and
 * no normalization dispatcher to enqueue with. `APP3-B05A` writes nothing, and
 * the way that is guaranteed is that nothing here can.
 *
 * Deliberately absent: any upload, any Template intake, any mutation, any
 * asset-by-id or derivative-by-id route, any Session route, and any presign
 * capability.
 */
@Module({
  imports: [DatabaseModule, CatalogPlacementReadModule, ObjectStorageModule],
  controllers: [PublicDesignTemplateAssetController],
  providers: [
    {
      provide: PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY,
      useClass: DrizzlePublicDesignTemplateAssetRepository,
    },
    PublicDesignTemplateAssetService,
  ],
})
export class DesignTemplateAssetPublicModule {}
