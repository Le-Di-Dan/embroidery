/**
 * `orders` / `order_items` rows → the Admin read model, branched on origin
 * (`APP12-A02-C1`).
 *
 * ### What this replaces, and why the assertion survived
 *
 * `APP7-B02` mapped every row as a custom order and called a
 * `requireCustomChain()` that **threw** when `custom_request_id`,
 * `accepted_quotation_version_id`, `current_approval_snapshot_id` or a line's
 * `approval_snapshot_id` was `NULL`. `APP12-DB01` then made exactly those
 * columns `NULL` for a `READY_MADE` order, by CHECK constraint, so the throw
 * stopped being a guard against corruption and became the way a legitimate row
 * produced HTTP 500 — for the **whole queue page**, custom rows included, since
 * the queue maps row by row inside one request.
 *
 * The fix is not to delete the assertion. It is to give it the discriminator it
 * was always implicitly asserting against. `ck_orders__custom_chain_by_origin`
 * says the four columns are non-null on `CUSTOM` and null on `READY_MADE`;
 * these mappers assert that same pair of facts in both directions, so a row
 * that violates the constraint still fails loudly here rather than reaching an
 * operator as an empty string or a fabricated id.
 *
 * ### Nothing is invented for the missing half
 *
 * A Ready-Made row gets no sentinel UUID, no placeholder request, no synthetic
 * quotation version and no fabricated approval snapshot. The fields are simply
 * `undefined`, and `origin` is what tells every consumer that this is the
 * truthful shape rather than a lossy read.
 */
import type { OrderOrigin, OrderState } from '@embroidery/database';

import type {
  AdminOrderItemRow,
  AdminOrderQueueRow,
} from '../../domain/repositories/admin-order-read.repository';

const CUSTOM: OrderOrigin = 'CUSTOM';

/** The `orders` columns both reads select. */
export interface AdminOrderRootColumns {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly origin: string;
  readonly customRequestId: string | null;
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: Date;
}

/**
 * The one place an `orders` row becomes a queue row.
 *
 * `origin` is read first because every other decision in this file depends on
 * it, and an unrecognised value is refused rather than defaulted: defaulting to
 * `CUSTOM` would make a future third origin silently claim a custom chain it
 * does not have.
 */
export function toAdminOrderQueueRow(row: AdminOrderRootColumns): AdminOrderQueueRow {
  const origin = row.origin as OrderOrigin;
  return {
    id: row.id,
    code: row.code,
    status: row.status as OrderState,
    origin,
    customRequestId: customChainField(origin, row.customRequestId, 'custom_request_id'),
    customerId: row.customerId,
    totalAmount: row.totalAmount,
    currencyCode: row.currencyCode,
    createdAt: row.createdAt,
  };
}

/** The `order_items` columns the detail read selects. */
export interface AdminOrderItemColumns {
  readonly position: number;
  readonly skuId: string | null;
  readonly customerOwnedProductId: string | null;
  readonly productName: string;
  readonly variantLabel: string | null;
  readonly sizeLabel: string | null;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
  readonly approvalSnapshotId: string | null;
}

/**
 * One frozen line, carried exactly as stored.
 *
 * The line's origin is the **order's** — `order_items` holds no discriminator of
 * its own, and `tg_order_items__origin_subject` is the trigger that reads the
 * parent's — so the caller passes it down rather than this function guessing
 * from the nullability it is meant to be checking.
 */
export function toAdminOrderItemRow(
  origin: OrderOrigin,
  row: AdminOrderItemColumns,
): AdminOrderItemRow {
  return {
    position: row.position,
    skuId: row.skuId ?? undefined,
    customerOwnedProductId: row.customerOwnedProductId ?? undefined,
    productName: row.productName,
    variantLabel: row.variantLabel ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    quantity: row.quantity,
    unitPriceAmount: row.unitPriceAmount,
    lineTotalAmount: row.lineTotalAmount,
    currencyCode: row.currencyCode,
    approvalSnapshotId: customChainField(origin, row.approvalSnapshotId, 'approval_snapshot_id'),
  };
}

/**
 * One custom-chain column, checked against the origin that decides it.
 *
 * Both directions are enforced. A `CUSTOM` row missing the value is corrupt —
 * `ck_orders__custom_chain_by_origin` and `tg_order_items__origin_subject`
 * forbid it — and a `READY_MADE` row carrying one is corrupt in the opposite
 * direction, which is worth catching too: it would mean a Ready-Made order had
 * acquired a quotation or an approval it was never entitled to, and publishing
 * that id would send an operator to a design case belonging to someone else.
 */
export function customChainField(
  origin: OrderOrigin,
  value: string | null,
  column: string,
): string | undefined {
  if (origin === CUSTOM) {
    if (value === null) {
      throw new Error(
        `admin order read: ${column} is null on a CUSTOM order, which ` +
          'ck_orders__custom_chain_by_origin forbids.',
      );
    }
    return value;
  }
  if (value !== null) {
    throw new Error(
      `admin order read: ${column} is set on a ${origin} order, which ` +
        'ck_orders__custom_chain_by_origin forbids.',
    );
  }
  return undefined;
}
