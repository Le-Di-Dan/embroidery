/**
 * The order-line subject, read off the stored XOR (`APP7-B02` §7, §16).
 *
 * `order_items` expresses "catalog SKU or customer-owned product" as two
 * nullable columns under `ck_order_items__exactly_one_subject`, and B02 adds no
 * column and no enum to the database for it. What it does publish is the
 * discriminator the delivered Admin convention already uses —
 * `AdminCustomRequestQueueItemResponse.subjectKind`, `CATALOG` |
 * `CUSTOMER_OWNED` — derived here from the row itself so a generated client can
 * branch without inspecting two nullable ids and guessing.
 *
 * Derived, never asserted. A row with both subjects or neither cannot reach a
 * client as one branch quietly winning: the CHECK constraint makes it
 * unreachable, and if it ever were reachable this refuses instead of choosing.
 *
 * Pure: no query, no clock, no injection. Which subject a frozen line names can
 * be argued about here rather than inside a controller.
 */
import type { AdminOrderItemRow } from '../../domain/repositories/admin-order-read.repository';

export const ORDER_ITEM_SUBJECT_KINDS = ['CATALOG', 'CUSTOMER_OWNED'] as const;

export type OrderItemSubjectKind = (typeof ORDER_ITEM_SUBJECT_KINDS)[number];

/**
 * The subject branch of one frozen line.
 *
 * Both ids are carried through unchanged. The customer-owned branch keeps
 * `skuId` absent rather than empty-stringed, and the catalog branch keeps
 * `customerOwnedProductId` absent: neither is filled in from the other, so no
 * Catalog identity is ever fabricated for a customer-supplied item.
 */
export interface OrderItemSubject {
  readonly kind: OrderItemSubjectKind;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
}

export class OrderItemSubjectAmbiguousError extends Error {
  constructor(position: number) {
    // Names the position, not the ids: an operator can find the line, and the
    // message discloses no identifier they were not already reading.
    super(`Order line ${String(position)} does not name exactly one subject.`);
    this.name = 'OrderItemSubjectAmbiguousError';
  }
}

export function projectOrderItemSubject(
  row: Pick<AdminOrderItemRow, 'position' | 'skuId' | 'customerOwnedProductId'>,
): OrderItemSubject {
  const hasSku = row.skuId !== undefined;
  const hasCustomerOwned = row.customerOwnedProductId !== undefined;

  if (hasSku === hasCustomerOwned) {
    throw new OrderItemSubjectAmbiguousError(row.position);
  }
  return {
    kind: hasSku ? 'CATALOG' : 'CUSTOMER_OWNED',
    skuId: row.skuId,
    customerOwnedProductId: row.customerOwnedProductId,
  };
}
