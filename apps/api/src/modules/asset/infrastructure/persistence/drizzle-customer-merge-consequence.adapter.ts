/**
 * Asset's half of the merge consequence preview (`APP10-B02` §13).
 *
 * One COUNT against `assets`. No row is retrieved, so `storage_key`,
 * `checksum` and `mime_type` are never in hand — the projection cannot leak
 * what it does not select.
 *
 * No transaction, no write, no lock.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { count, eq } from 'drizzle-orm';

import type { AssetMergeConsequencePort } from '../../domain/repositories/customer-merge-consequence.port';

const { assets } = schema;

@Injectable()
export class DrizzleCustomerMergeConsequenceAdapter
  extends DrizzleRepository
  implements AssetMergeConsequencePort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async countUploadsByCustomer(customerId: string): Promise<number> {
    return this.run('countUploadsByCustomer', async () => {
      const [row] = await this.db
        .select({ total: count() })
        .from(assets)
        .where(eq(assets.uploadedByCustomerId, customerId));

      return row?.total ?? 0;
    });
  }
}
