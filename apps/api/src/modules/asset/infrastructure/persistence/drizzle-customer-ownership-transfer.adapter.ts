/**
 * Asset's half of the merge ownership transfer (`APP10-B03` §13).
 *
 * One `UPDATE` against `assets`, returning the ids it changed so the count is
 * the database's own. No row content is selected, so `storage_key`, `checksum`
 * and `mime_type` are never in hand on this path.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type { AssetCustomerOwnershipTransferPort } from '../../domain/repositories/customer-ownership-transfer.port';

const { assets } = schema;

@Injectable()
export class DrizzleCustomerOwnershipTransferAdapter
  extends DrizzleRepository
  implements AssetCustomerOwnershipTransferPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async repointUploader(fromCustomerId: string, toCustomerId: string): Promise<number> {
    return this.run('repointUploader', async () => {
      // The merge's transaction, asserted rather than assumed — see the port.
      const tx = this.requireTransaction('repointUploader');
      const moved = await tx
        .update(assets)
        .set({ uploadedByCustomerId: toCustomerId, updatedAt: new Date() })
        .where(eq(assets.uploadedByCustomerId, fromCustomerId))
        .returning({ id: assets.id });

      return moved.length;
    });
  }
}
