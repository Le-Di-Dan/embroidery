/**
 * What one order actually requires of inventory (`APP8-W01` §5, §6, §8).
 *
 * Pure: order items in, a sorted requirement set out. No database, no clock, no
 * identity generation — which is what makes the aggregation rule testable
 * without a PostgreSQL instance and impossible to accidentally couple to a live
 * Catalog read.
 *
 * ### The input is frozen, and only the frozen input
 *
 * `order_items` are immutable snapshots (INV-12, enforced by an S24 trigger).
 * `ck_order_items__exactly_one_subject` guarantees each row is a Catalog item
 * (`sku_id` set, `customer_owned_product_id` null) or a COP item (the reverse) —
 * never both, never neither. So the branch below is a total function over what
 * the database can store, and nothing here consults live product defaults, live
 * SKU configuration, the quotation, the custom request or the design session.
 *
 * ### Aggregation is required, not an optimisation
 *
 * `CST-016` / `uq_inventory_reservations__order_stock__reserved` allows **one**
 * active `RESERVED` row per `(order_id, sku_stock_id)`. Two Catalog items
 * resolving to one SKU are therefore one reservation whose quantity covers both
 * — `APP8-G01` §1.5, which settles the audit's per-item phrasing against the
 * delivered schema. Creating a row per item would collide with that index on the
 * second insert; this function is why it never gets there.
 *
 * ### The order of the result is the lock order
 *
 * `createReservation` takes the `sku_stocks` anchor row lock per requirement, so
 * a multi-SKU order takes several anchor locks in one transaction — the first
 * flow in the repository to do so (`DB8_LOCK_ORDER_MATRIX.md` §2 documented no
 * such pair before this checkpoint). Two workers reserving overlapping SKU sets
 * for different orders would deadlock if each locked in its own event's item
 * order. Sorting by SKU id gives every execution the same acquisition order for
 * the same logical lock set, which is exactly the property that makes the cycle
 * unconstructible — no `SERIALIZABLE`, no advisory lock, no distributed lock.
 *
 * The sort key is the canonical SKU identity, not the `sku_stocks` row id: the
 * anchor id is not knowable until the anchor has been read, and an ordering you
 * cannot compute before you start locking is not an ordering.
 */
import type { OrderItem, SkuId } from '@embroidery/persistence';

/** One SKU's total frozen Catalog quantity for one order. */
export interface ReservationRequirement {
  readonly skuId: SkuId;
  readonly quantity: number;
}

/**
 * The order's Catalog requirements, aggregated by SKU and sorted by SKU id.
 *
 * COP items contribute nothing and are not represented in the result at all —
 * no zero-quantity entry, no placeholder SKU, no fabricated stock identity
 * (`PO-APP8-001`, `COP_FAKE_INVENTORY_PATH = FORBIDDEN`). A COP-only order
 * therefore yields `[]`, which is a complete answer rather than an empty one.
 */
export function aggregateCatalogRequirements(
  items: readonly OrderItem[],
): readonly ReservationRequirement[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (item.skuId === undefined) {
      // The COP branch. `customer_owned_product_id` is set and there is no SKU,
      // so there is no inventory identity to commit against and none is invented.
      continue;
    }
    totals.set(item.skuId, (totals.get(item.skuId) ?? 0) + item.quantity);
  }

  return [...totals.entries()]
    .map(([skuId, quantity]) => ({ skuId: skuId as SkuId, quantity }))
    .sort((left, right) => (left.skuId < right.skuId ? -1 : left.skuId > right.skuId ? 1 : 0));
}
