/**
 * Ordering's half of the merge ownership transfer (`APP10-B03` §13).
 *
 * Two `UPDATE`s against Ordering's own tables, each returning the ids it
 * changed so the count is the database's answer rather than an assumption. No
 * row content is read, so no order code, total or customer-visible reason is
 * ever in hand on this path.
 *
 * There is no statement here against `custom_request_transitions` or
 * `order_transitions`. Both are append-only history and stay exactly as they
 * are — the tombstone pointer is what a later reader follows forward.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type {
  OrderingCustomerOwnershipTransferPort,
  OrderingOwnershipTransferCounts,
} from '../../domain/repositories/customer-ownership-transfer.port';

const { customRequests, orders } = schema;

@Injectable()
export class DrizzleCustomerOwnershipTransferAdapter
  extends DrizzleRepository
  implements OrderingCustomerOwnershipTransferPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async repointCustomer(
    fromCustomerId: string,
    toCustomerId: string,
  ): Promise<OrderingOwnershipTransferCounts> {
    return this.run('repointCustomer', async () => {
      // The merge's transaction, resolved from the ambient context. Asserted
      // rather than assumed: a repoint that committed on its own would leave
      // the orders moved and the tombstone unwritten.
      const tx = this.requireTransaction('repointCustomer');

      const movedRequests = await tx
        .update(customRequests)
        .set({ customerId: toCustomerId, updatedAt: new Date() })
        .where(eq(customRequests.customerId, fromCustomerId))
        .returning({ id: customRequests.id });

      const movedOrders = await tx
        .update(orders)
        .set({ customerId: toCustomerId, updatedAt: new Date() })
        .where(eq(orders.customerId, fromCustomerId))
        .returning({ id: orders.id });

      return { customRequests: movedRequests.length, orders: movedOrders.length };
    });
  }
}
