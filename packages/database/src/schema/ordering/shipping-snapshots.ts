/**
 * TBL-048 `shipping_snapshots` — the immutable dispatch-time freeze of one
 * order's shipping data (CTX-ORD, AGG-15, `snap`).
 *
 * Columns: COL-TBL048-01..12 (-10 ×2, -11 ×2) · Constraints: CST-001,
 * CST-034 (IDX-036, one dispatch freeze), CST-066 instance (fee ≥ 0),
 * CST-094 (**immutable trigger candidate, S24** — same treatment as
 * `shipping_details` FROZEN)
 * Relationships: REL-078 (→ orders, restrict), REL-079 (→
 * shipping_details, 1–1, restrict — dispatch freeze, GRD-017)
 * Indexes: IDX-036 (constraint-created)
 * Owner: Ordering module.
 *
 * **Created once, in the dispatch transaction** (GRD-017,
 * `TR-LC14-07`): a byte-for-byte copy of `shipping_details`' PII/fee facts
 * at the moment of freeze. `shipping_details` may still exist and (per its
 * own FROZEN state) never change again — this table is the separate,
 * dedicated evidence row DB4 requires for the freeze boundary itself, not
 * a duplicate of the same authority.
 *
 * `province`/`country_code` are NOT NULL (frozen facts always resolved by
 * dispatch time); the other PII columns mirror `shipping_details`'
 * nullability at freeze time ("per source").
 *
 * **CST-094 is not yet a database mechanism** — S24 owns the trigger.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { orders } from './orders';
import { shippingDetails } from './shipping-details';

export const shippingSnapshots = pgTable(
  'shipping_snapshots',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    shippingDetailId: idReference('shipping_detail_id').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    addressLine: text('address_line').notNull(),
    ward: text('ward'),
    district: text('district'),
    province: text('province').notNull(),
    countryCode: text('country_code').notNull(),
    feeAmount: numeric('fee_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    carrierName: text('carrier_name'),
    trackingCode: text('tracking_code'),
    dispatchedAt: instant('dispatched_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_shipping_snapshots', columns: [t.id] }),
    // CST-034 / IDX-036 — one dispatch freeze per order.
    unique('uq_shipping_snapshots__order').on(t.orderId),
    // REL-078 — composed under its order.
    foreignKey({
      name: 'fk_shipping_snapshots__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-079 — the frozen source; never deleted while its snapshot exists.
    foreignKey({
      name: 'fk_shipping_snapshots__shipping_detail_id',
      columns: [t.shippingDetailId],
      foreignColumns: [shippingDetails.id],
    }).onDelete('restrict'),
    check('ck_shipping_snapshots__fee_non_negative', sql`${t.feeAmount} >= 0`),
    check('ck_shipping_snapshots__currency_vnd', sql`${t.currencyCode} = 'VND'`),
  ],
);
