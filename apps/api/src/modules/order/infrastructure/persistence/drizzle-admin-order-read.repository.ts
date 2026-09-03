/**
 * Drizzle implementation of the Admin order read model (`APP7-B02` §10, §20).
 *
 * Every statement names its columns. That is what keeps `hold_reason`,
 * `cancelled_reason`, `cancelled_customer_reason`, `delivered_at` and
 * `completed_at` out of a response B02 has no authority to define, and it is
 * what makes the "no live Catalog re-read" rule checkable by looking at this
 * file: there is no `products`, `product_variants`, `product_sides`,
 * `embroidery_areas`, `skus`, `quotations`, `quotation_versions`,
 * `design_cases` or `customers` table anywhere in it. Two tables are read,
 * `orders` and `order_items`, and both are frozen order-owned truth.
 *
 * ### The queue's access path
 *
 * `ix_orders__status_created_id` is `(status, created_at DESC, id DESC)` —
 * IDX-074, created by DB5 for exactly this list. The query filters
 * `status IN (…)` and pages on `(created_at, id) < (…)`, which is that index's
 * leading column followed by its ordering columns. No migration is needed and
 * none is added.
 *
 * ### No aggregation, no arithmetic
 *
 * There is no `sum()`, no `count()` and no multiplication here. A COUNT over the
 * whole table is the second query keyset pagination exists to avoid, and a
 * recomputed line total would be this file overruling the money the customer
 * accepted.
 *
 * No write, no transaction, no lock: reading an order changes nothing, and a
 * lock taken by a report is a lock a deposit verification would wait on.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { OrderOrigin } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';

import type {
  AdminOrderDetailRow,
  AdminOrderItemRow,
  AdminOrderQueueQuery,
  AdminOrderQueueRow,
  AdminOrderReadRepository,
} from '../../domain/repositories/admin-order-read.repository';
import {
  customChainField,
  toAdminOrderItemRow,
  toAdminOrderQueueRow,
} from './admin-order-row.mapper';

const { orders, orderItems } = schema;

/** The order-root columns the queue reports. Reused by the detail read. */
const ORDER_ROOT_COLUMNS = {
  id: orders.id,
  code: orders.code,
  status: orders.status,
  origin: orders.origin,
  customRequestId: orders.customRequestId,
  customerId: orders.customerId,
  totalAmount: orders.totalAmount,
  currencyCode: orders.currencyCode,
  createdAt: orders.createdAt,
} as const;

@Injectable()
export class DrizzleAdminOrderReadRepository
  extends DrizzleRepository
  implements AdminOrderReadRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listQueue(query: AdminOrderQueueQuery): Promise<AdminOrderQueueRow[]> {
    return this.run('listQueue', async () => {
      const { filter, after } = query;
      const conditions: SQL[] = [];

      if (filter.statuses !== undefined) {
        conditions.push(inArray(orders.status, [...filter.statuses]));
      }
      // `APP12-A02-C1` — the origin predicate joins the same `where`, so a
      // filtered page is one PostgreSQL built and the keyset below pages over
      // the filtered set. Filtering in application memory after the page was
      // fetched would return short pages and a cursor that skips rows.
      if (filter.origins !== undefined) {
        conditions.push(inArray(orders.origin, [...filter.origins]));
      }
      if (after !== undefined) {
        // The keyset predicate, written out rather than as a row comparison so
        // it stays readable: strictly older, or the same instant with a smaller
        // id. `created_at` is not unique — two orders converted from the same
        // approval batch can share a millisecond — so the id is what makes the
        // page boundary total and stops a row being repeated or skipped.
        const keyset = or(
          lt(orders.createdAt, after.createdAt),
          and(eq(orders.createdAt, after.createdAt), lt(orders.id, after.id)),
        );
        if (keyset !== undefined) {
          conditions.push(keyset);
        }
      }

      const rows = await this.db
        .select(ORDER_ROOT_COLUMNS)
        .from(orders)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(query.limit + 1);

      return rows.map(toAdminOrderQueueRow);
    });
  }

  async findDetail(orderId: string): Promise<AdminOrderDetailRow | undefined> {
    return this.run('findDetail', async () => {
      const [row] = await this.db
        .select({
          ...ORDER_ROOT_COLUMNS,
          acceptedQuotationVersionId: orders.acceptedQuotationVersionId,
          currentApprovalSnapshotId: orders.currentApprovalSnapshotId,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      const base = toAdminOrderQueueRow(row);
      return {
        ...base,
        acceptedQuotationVersionId: customChainField(
          base.origin,
          row.acceptedQuotationVersionId,
          'accepted_quotation_version_id',
        ),
        currentApprovalSnapshotId: customChainField(
          base.origin,
          row.currentApprovalSnapshotId,
          'current_approval_snapshot_id',
        ),
        updatedAt: row.updatedAt,
      };
    });
  }

  async loadItems(orderId: string, origin: OrderOrigin): Promise<AdminOrderItemRow[]> {
    return this.run('loadItems', async () => {
      const rows = await this.db
        .select({
          position: orderItems.position,
          skuId: orderItems.skuId,
          customerOwnedProductId: orderItems.customerOwnedProductId,
          productName: orderItems.productName,
          variantLabel: orderItems.variantLabel,
          sizeLabel: orderItems.sizeLabel,
          quantity: orderItems.quantity,
          unitPriceAmount: orderItems.unitPriceAmount,
          lineTotalAmount: orderItems.lineTotalAmount,
          currencyCode: orderItems.currencyCode,
          approvalSnapshotId: orderItems.approvalSnapshotId,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        // `uq_order_items__order_position` makes this total, so the order the
        // lines were frozen in is the order they are reported in. Sorting in the
        // database rather than in JavaScript keeps the guarantee where the
        // uniqueness that backs it lives.
        .orderBy(asc(orderItems.position));

      return rows.map((row) => toAdminOrderItemRow(origin, row));
    });
  }
}
