import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ASSET_REPOSITORY } from './domain/repositories/asset.repository';
import { DrizzleAssetRepository } from './infrastructure/persistence/drizzle-asset.repository';

/** CTX-AST — asset metadata persistence (DB7-CP3). Binaries live in object storage. */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: ASSET_REPOSITORY, useClass: DrizzleAssetRepository }],
  exports: [ASSET_REPOSITORY],
})
export class AssetModule {}
