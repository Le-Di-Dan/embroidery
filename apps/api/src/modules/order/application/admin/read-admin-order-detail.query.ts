/**
 * One Admin order detail (`APP7-B02` §7).
 *
 * Two statements: the order root, then its frozen lines. The root is read first
 * so an unknown id is a 404 before any line query runs, and so a missing order
 * and an order with no lines stay distinguishable.
 *
 * ### Everything here was frozen by `APP7-W01`
 *
 * `productName`, `variantLabel` and `sizeLabel` are `order_items` columns. They
 * are what the Approval Snapshot and the accepted quotation version said at
 * conversion time, and they keep saying it after the Catalog product is renamed,
 * the variant is retired or the SKU is repriced. This class reads no Catalog
 * table to "improve" them, and hides nothing to disguise the fact that
 * `sizeLabel` is null on every line W01 writes — a column with no frozen source
 * stays null rather than being reconstructed from `product_variants`.
 *
 * Money is likewise transported, never computed: no `unit × quantity`, no
 * `sum(lines)`, no deposit percentage and no current SKU price. `APP7-B03` owns
 * what the customer is asked to transfer; this is what was agreed.
 *
 * ### Not a payment surface
 *
 * There is no payment attempt, obligation, reference, evidence or provider field
 * here, and no third endpoint to fetch one — `APP7-B04` owns Admin payment
 * operations. The order's own `status` is reported because it is order state:
 * an order that reaches `DEPOSIT_PAID` says so here, without this file knowing
 * how it got there.
 */
import { Inject, Injectable } from '@nestjs/common';

import { adminOrderReadError } from '../../domain/admin/admin-order-read.errors';
import {
  ADMIN_ORDER_READ_REPOSITORY,
  type AdminOrderItemRow,
  type AdminOrderReadRepository,
} from '../../domain/repositories/admin-order-read.repository';
import { projectOrderItemSubject, type OrderItemSubjectKind } from './admin-order.projection';
import type { AdminOrderQueueItem } from './read-admin-order-queue.query';

export interface AdminOrderItemView {
  readonly position: number;
  readonly subjectKind: OrderItemSubjectKind;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
  readonly approvalSnapshotId: string;
}

export interface AdminOrderDetailView extends AdminOrderQueueItem {
  readonly acceptedQuotationVersionId: string;
  readonly currentApprovalSnapshotId: string;
  readonly updatedAt: Date;
  readonly items: readonly AdminOrderItemView[];
}

@Injectable()
export class ReadAdminOrderDetail {
  constructor(
    @Inject(ADMIN_ORDER_READ_REPOSITORY) private readonly orders: AdminOrderReadRepository,
  ) {}

  async read(orderId: string): Promise<AdminOrderDetailView> {
    const row = await this.orders.findDetail(orderId);
    if (row === undefined) {
      throw adminOrderReadError('ORDER_NOT_FOUND');
    }

    const items = await this.orders.loadItems(orderId);

    return {
      orderId: row.id,
      code: row.code,
      status: row.status,
      customRequestId: row.customRequestId,
      customerId: row.customerId,
      acceptedQuotationVersionId: row.acceptedQuotationVersionId,
      currentApprovalSnapshotId: row.currentApprovalSnapshotId,
      totalAmount: row.totalAmount,
      currencyCode: row.currencyCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: items.map(toItemView),
    };
  }
}

/** One frozen line, with its subject branch read off the stored XOR. */
function toItemView(row: AdminOrderItemRow): AdminOrderItemView {
  const subject = projectOrderItemSubject(row);
  return {
    position: row.position,
    subjectKind: subject.kind,
    skuId: subject.skuId,
    customerOwnedProductId: subject.customerOwnedProductId,
    productName: row.productName,
    variantLabel: row.variantLabel,
    sizeLabel: row.sizeLabel,
    quantity: row.quantity,
    unitPriceAmount: row.unitPriceAmount,
    lineTotalAmount: row.lineTotalAmount,
    currencyCode: row.currencyCode,
    approvalSnapshotId: row.approvalSnapshotId,
  };
}
