/**
 * Ordering's half of the merge consequence preview (`APP10-B02` §13).
 *
 * Two COUNTs against Ordering's own tables, and nothing else. No row is
 * retrieved, so there is no order code, no request code, no total and no
 * customer-visible reason to keep out of a response — the projection cannot
 * carry what it never selects.
 *
 * No transaction, no write, no lock. Counting is not an action, and the numbers
 * are advisory by construction: `APP10-B03` re-evaluates ownership inside the
 * transaction that moves it.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { count, eq } from 'drizzle-orm';

import type {
  OrderingCustomerReferenceCounts,
  OrderingMergeConsequencePort,
} from '../../domain/repositories/customer-merge-consequence.port';

const { customRequests, orders } = schema;

@Injectable()
export class DrizzleCustomerMergeConsequenceAdapter
  extends DrizzleRepository
  implements OrderingMergeConsequencePort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async countLiveCustomerReferences(customerId: string): Promise<OrderingCustomerReferenceCounts> {
    return this.run('countLiveCustomerReferences', async () => {
      // Two statements rather than one join: a join between two tables that are
      // only related through the customer multiplies the rows, and the fix for
      // that is a pair of independent counts.
      const [requestRow] = await this.db
        .select({ total: count() })
        .from(customRequests)
        .where(eq(customRequests.customerId, customerId));

      const [orderRow] = await this.db
        .select({ total: count() })
        .from(orders)
        .where(eq(orders.customerId, customerId));

      return {
        customRequests: requestRow?.total ?? 0,
        orders: orderRow?.total ?? 0,
      };
    });
  }
}
