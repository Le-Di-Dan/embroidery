import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT } from './domain/repositories/customer-ownership-transfer.port';
import { DrizzleCustomerOwnershipTransferAdapter } from './infrastructure/persistence/drizzle-customer-ownership-transfer.adapter';

/**
 * Asset's merge ownership transfer, published on its own (`APP10-B03` §14).
 *
 * One write port with one method, kept apart from `AssetMergeConsequenceModule`
 * because a preview must not be able to write, and apart from `AssetModule`
 * because that one exports `ASSET_REPOSITORY`, whose rows carry the private
 * storage location of every customer original.
 *
 * No controller, so no route; `DatabaseModule` is imported for the adapter's
 * executor and not re-exported.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT,
      useClass: DrizzleCustomerOwnershipTransferAdapter,
    },
  ],
  exports: [ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT],
})
export class AssetCustomerOwnershipTransferModule {}
