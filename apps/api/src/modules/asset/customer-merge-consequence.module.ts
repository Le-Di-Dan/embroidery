import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ASSET_MERGE_CONSEQUENCE_PORT } from './domain/repositories/customer-merge-consequence.port';
import { DrizzleCustomerMergeConsequenceAdapter } from './infrastructure/persistence/drizzle-customer-merge-consequence.adapter';

/**
 * Asset's upload count, published on its own (`APP10-B02` §13).
 *
 * A module that exports **one read-only port**, on the precedent
 * `OrderDepositContextModule` sets for this repository. It exists rather than
 * adding the provider to `AssetModule` because that module exports
 * `ASSET_REPOSITORY` — the write contract whose rows carry `storage_key`. A
 * merge preview that imported it to count uploads would gain the private
 * location of every customer original in the same injector.
 *
 * No controller, so no route; `DatabaseModule` is imported for the adapter's
 * executor and not re-exported.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ASSET_MERGE_CONSEQUENCE_PORT, useClass: DrizzleCustomerMergeConsequenceAdapter },
  ],
  exports: [ASSET_MERGE_CONSEQUENCE_PORT],
})
export class AssetMergeConsequenceModule {}
