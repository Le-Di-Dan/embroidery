import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ASSET_REPOSITORY } from './domain/repositories/asset.repository';
import { DrizzleAssetRepository } from './infrastructure/persistence/drizzle-asset.repository';

/**
 * CTX-AST — asset metadata persistence (DB7-CP3). Binaries live in object
 * storage; this module never holds one and never speaks HTTP.
 *
 * Deliberately free of the intake feature: the Admin upload/detail/list
 * surface lives in `AssetIntakeModule`, which imports this one. Keeping the
 * persistence module standalone means a suite that only exercises the
 * repository does not have to stand up authentication, object storage or a
 * controller to do it.
 */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: ASSET_REPOSITORY, useClass: DrizzleAssetRepository }],
  exports: [ASSET_REPOSITORY],
})
export class AssetModule {}
