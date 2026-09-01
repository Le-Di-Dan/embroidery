/**
 * Drizzle implementation of the production-context port (`APP8-B03` §5.3).
 *
 * Three columns from `orders` and two counts over `order_items`, named
 * explicitly. `select()` with no projection would return whatever TBL-043 grows
 * next — which today already means `customer_id`, `total_amount`, `status`,
 * `hold_reason` and `cancelled_reason` — so listing the three is what makes
 * "the production surface reads no order state and no money" a property of the
 * statement rather than of a mapper someone could later edit.
 *
 * `pk_orders` makes the lookup single-valued, so there is no ordering rule here
 * to get wrong and no "latest order" heuristic to invent.
 *
 * The counts are a `filter`ed aggregate in one statement rather than two
 * queries or a fetch of the lines: a production screen needs to know *whether*
 * the order has Catalog subjects, and pulling every frozen line to count them
 * would drag the commercial values into an injector that has no use for them.
 *
 * No write, no transaction, no lock: reading an order changes nothing, and a
 * lock taken by a production read is a lock a deposit verification would wait on.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { count, eq } from 'drizzle-orm';

import type {
  OrderProductionContext,
  OrderProductionContextPort,
} from '../../domain/repositories/order-production-context.port';

const { orders, orderItems } = schema;

@Injectable()
export class DrizzleOrderProductionContextAdapter
  extends DrizzleRepository
  implements OrderProductionContextPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findByOrderId(orderId: string): Promise<OrderProductionContext | undefined> {
    return this.run('findByOrderId', async () => {
      const [order] = await this.db
        .select({
          id: orders.id,
          code: orders.code,
          currentApprovalSnapshotId: orders.currentApprovalSnapshotId,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (order === undefined) {
        return undefined;
      }

      if (order.currentApprovalSnapshotId === null) {
        // APP12-DB01 made the pointer nullable for `READY_MADE` orders, which
        // have no approval snapshot because nothing is manufactured for them.
        // Production is a custom-only context (APP8), so a null here means the
        // caller routed a Ready-Made order into it — refused rather than
        // producing a context with no production authority to point at.
        throw new Error(
          `order ${orderId} has no approval snapshot, so it is not a custom order; ` +
            'production is CUSTOM-only.',
        );
      }

      const [subjects] = await this.db
        .select({
          catalog: count(orderItems.skuId),
          customerOwned: count(orderItems.customerOwnedProductId),
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      return {
        orderId: order.id,
        code: order.code,
        currentApprovalSnapshotId: order.currentApprovalSnapshotId,
        // `count(column)` counts non-null values, which is exactly the XOR's
        // two branches: a line contributes to one count or the other, never
        // both (`ck_order_items__exactly_one_subject`).
        catalogItemCount: subjects?.catalog ?? 0,
        customerOwnedItemCount: subjects?.customerOwned ?? 0,
      };
    });
  }
}
