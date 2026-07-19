/**
 * TBL-044 `order_items` — one frozen commercial line (SKU or customer-
 * owned-product subject) of an order (CTX-ORD, AGG-15, `snap (child)`).
 *
 * Columns: COL-TBL044-01..09 (-05 ×3, -07 ×2) · Constraints: CST-001,
 * CST-031 (IDX-033), CST-062 instance (quantity > 0), CST-067 (exactly one
 * subject), CST-090-class immutable trigger candidate (S24, INV-12)
 * Relationships: REL-075 (→ orders, restrict), REL-076 ×2 (→ skus,
 * → customer_owned_products, nullable, restrict), REL-077 (→
 * approval_snapshots, restrict — production integrity chain, D7-07)
 * Indexes: IDX-033 (constraint-created)
 * Owner: Ordering module.
 *
 * **All columns immutable (INV-12).** Frozen from the accepted quotation
 * version's line items at order-creation time; a correction is never an
 * UPDATE — S24 owns the reject-mutation trigger, not yet a database
 * mechanism here (same honestly-documented gap as CST-090/096/092).
 *
 * `sku_id`/`customer_owned_product_id` are mutually exclusive (CST-067,
 * INV-13 boundary) — a customer-owned-product line never carries a SKU
 * reference, same absent-FK rule already established for
 * `customer_owned_products` itself (REL-063).
 *
 * `approval_snapshot_id` is **NOT NULL** (D7-07): every line item is
 * production-traceable to the exact approval evidence that authorized it,
 * never to a mutable current pointer.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { currencyScaleCheck } from '../../primitives/money';
import { orders } from './orders';
import { skus } from '../catalog/skus';
import { customerOwnedProducts } from './customer-owned-products';
import { approvalSnapshots } from '../design/approval-snapshots';

export const orderItems = pgTable(
  'order_items',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    position: integer('position').notNull(),
    skuId: idReference('sku_id'),
    customerOwnedProductId: idReference('customer_owned_product_id'),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label'),
    sizeLabel: text('size_label'),
    quantity: integer('quantity').notNull(),
    unitPriceAmount: numeric('unit_price_amount', { precision: 14, scale: 2 }).notNull(),
    lineTotalAmount: numeric('line_total_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    approvalSnapshotId: idReference('approval_snapshot_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_order_items', columns: [t.id] }),
    // CST-031 / IDX-033 — line positions never duplicated within an order.
    unique('uq_order_items__order_position').on(t.orderId, t.position),
    // REL-075 — items are never deleted while their order exists.
    foreignKey({
      name: 'fk_order_items__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-076 — mutually exclusive subject (CST-067); catalog rows archive-only.
    foreignKey({
      name: 'fk_order_items__sku_id',
      columns: [t.skuId],
      foreignColumns: [skus.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_order_items__customer_owned_product_id',
      columns: [t.customerOwnedProductId],
      foreignColumns: [customerOwnedProducts.id],
    }).onDelete('restrict'),
    // REL-077 — production integrity chain (D7-07); never the mutable pointer.
    foreignKey({
      name: 'fk_order_items__approval_snapshot_id',
      columns: [t.approvalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
    // CST-067 — exactly one subject; ambiguous or absent subjects rejected.
    check(
      'ck_order_items__exactly_one_subject',
      sql`(${t.skuId} is not null and ${t.customerOwnedProductId} is null) or (${t.skuId} is null and ${t.customerOwnedProductId} is not null)`,
    ),
    check('ck_order_items__quantity_positive', sql`${t.quantity} > 0`),
    check('ck_order_items__unit_price_non_negative', sql`${t.unitPriceAmount} >= 0`),
    check('ck_order_items__line_total_non_negative', sql`${t.lineTotalAmount} >= 0`),
    check('ck_order_items__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // DB6-C5 (B2) — VND has no minor unit (DEV-DB6-005).
    check(
      'ck_order_items__unit_price_currency_scale',
      currencyScaleCheck(t.unitPriceAmount, t.currencyCode),
    ),
    check(
      'ck_order_items__line_total_currency_scale',
      currencyScaleCheck(t.lineTotalAmount, t.currencyCode),
    ),
  ],
);
