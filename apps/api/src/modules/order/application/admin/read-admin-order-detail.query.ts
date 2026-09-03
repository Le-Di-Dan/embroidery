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
import { SKU_STOCK_REPOSITORY, type SkuStockRepository } from '@embroidery/persistence';
import type { OrderOrigin } from '@embroidery/database';

import { adminOrderReadError } from '../../domain/admin/admin-order-read.errors';
import {
  ADMIN_ORDER_READ_REPOSITORY,
  type AdminOrderItemRow,
  type AdminOrderReadRepository,
} from '../../domain/repositories/admin-order-read.repository';
import { projectOrderItemSubject, type OrderItemSubjectKind } from './admin-order.projection';
import type { AdminOrderQueueItem } from './read-admin-order-queue.query';

/** The one origin that holds stock against a payment window (`APP12-B02`). */
const READY_MADE: OrderOrigin = 'READY_MADE';

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
  /** Present exactly on a `CUSTOM` line; a Ready-Made SKU line approved nothing. */
  readonly approvalSnapshotId: string | undefined;
}

export interface AdminOrderDetailView extends AdminOrderQueueItem {
  /** Present exactly when `origin` is `CUSTOM`. */
  readonly acceptedQuotationVersionId: string | undefined;
  /** Present exactly when `origin` is `CUSTOM`. */
  readonly currentApprovalSnapshotId: string | undefined;
  readonly updatedAt: Date;
  /**
   * The Ready-Made reservation/payment deadline (`APP12-A02-C1`, D01 §J).
   *
   * The active reservation's own committed `expires_at`, read through the exact
   * `findActiveOrderReservation` the `APP12-B04` customer projection uses —
   * never `now + 24h`, never the newest row of a history and never a deadline
   * derived from the order's own timestamps. Absent on a custom order, and
   * absent once nothing `RESERVED` stands, which is exactly when a countdown
   * must stop being shown.
   *
   * The read takes no lock. An Admin report that took `FOR UPDATE` on this row
   * would be a lock the expiry sweep and the operator's own fee confirmation
   * then queue behind.
   */
  readonly paymentDeadline: Date | undefined;
  readonly items: readonly AdminOrderItemView[];
}

@Injectable()
export class ReadAdminOrderDetail {
  constructor(
    @Inject(ADMIN_ORDER_READ_REPOSITORY) private readonly orders: AdminOrderReadRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
  ) {}

  async read(orderId: string): Promise<AdminOrderDetailView> {
    const row = await this.orders.findDetail(orderId);
    if (row === undefined) {
      throw adminOrderReadError('ORDER_NOT_FOUND');
    }

    const items = await this.orders.loadItems(orderId, row.origin);
    // Read for a Ready-Made order only. A custom order's stock is reserved when
    // production starts, against a window that is not a payment deadline, and
    // publishing it under this name would be a countdown to the wrong event.
    const reservation =
      row.origin === READY_MADE ? await this.stock.findActiveOrderReservation(orderId) : undefined;

    return {
      orderId: row.id,
      code: row.code,
      status: row.status,
      origin: row.origin,
      customRequestId: row.customRequestId,
      customerId: row.customerId,
      acceptedQuotationVersionId: row.acceptedQuotationVersionId,
      currentApprovalSnapshotId: row.currentApprovalSnapshotId,
      totalAmount: row.totalAmount,
      currencyCode: row.currencyCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      paymentDeadline: reservation?.expiresAt,
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
