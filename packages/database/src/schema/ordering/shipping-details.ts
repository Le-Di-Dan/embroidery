/**
 * TBL-047 `shipping_details` — the admin-editable shipping preparation
 * record of one order (CTX-ORD, AGG-15, `entity`, mutable-until-frozen).
 *
 * Columns: COL-TBL047-01..11 (-02 ×2, -04 ×3, -08 ×2) · Constraints:
 * CST-001, CST-033 (IDX-035, order_id unique 0..1), CST-066 instance
 * (fee ≥ 0), CST-094 (**frozen-form reject-mutation trigger candidate,
 * S24** — dispatch evidence)
 * Relationships: REL-078 (→ orders, restrict)
 * Indexes: IDX-035 (constraint-created)
 * Owner: Ordering module.
 *
 * **LC-19 `EDITABLE` → `FROZEN`** (ADR-DB2-002): admin-editable until the
 * dispatch transaction freezes it (`TR-LC14-07`), at which point every
 * column here becomes immutable and the freeze evidence is copied into
 * `shipping_snapshots` (REL-079). Customer-requested changes before freeze
 * are a sensitive action (ADR-DB3-004), applied by admin — no direct
 * customer-write path exists at this layer. Post-freeze corrections are
 * compensating `order_transitions` `POST_FREEZE_CORRECTION` events, never
 * edits to this row (`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md`).
 *
 * `recipient_name`/`recipient_phone`/`address_line`/`ward`/`district`/
 * `province` are [PII] (CON-079/080) — may differ from the customer's own
 * profile. `country_code` defaults to `'VN'`.
 *
 * **CST-094 is not yet a database mechanism** — S24 owns the trigger; this
 * group implements the CHECK/FK/index layer only, same honestly-documented
 * gap as CST-090/092/096.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { currencyScaleCheck } from '../../primitives/money';
import { orders } from './orders';

export const SHIPPING_DETAIL_STATES = ['EDITABLE', 'FROZEN'] as const;
export type ShippingDetailState = (typeof SHIPPING_DETAIL_STATES)[number];

export const shippingDetails = pgTable(
  'shipping_details',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    addressLine: text('address_line').notNull(),
    ward: text('ward'),
    district: text('district'),
    province: text('province').notNull(),
    countryCode: text('country_code').notNull().default('VN'),
    feeAmount: numeric('fee_amount', { precision: 14, scale: 2 }),
    currencyCode: text('currency_code').notNull(),
    carrierName: text('carrier_name'),
    trackingCode: text('tracking_code'),
    fulfillmentNote: text('fulfillment_note'),
    status: stateColumn().notNull(),
    frozenAt: instant('frozen_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_shipping_details', columns: [t.id] }),
    // CST-033 / IDX-035 — at most one shipping record per order.
    unique('uq_shipping_details__order').on(t.orderId),
    // REL-078 — composed under its order.
    foreignKey({
      name: 'fk_shipping_details__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    check('ck_shipping_details__status_allowed', stateCheck(t.status, SHIPPING_DETAIL_STATES)),
    check(
      'ck_shipping_details__fee_non_negative',
      sql`${t.feeAmount} is null or ${t.feeAmount} >= 0`,
    ),
    check('ck_shipping_details__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // DB6-C5 (B2) — VND has no minor unit (DEV-DB6-005); null-safe (nullable amount).
    check(
      'ck_shipping_details__fee_currency_scale',
      currencyScaleCheck(t.feeAmount, t.currencyCode),
    ),
    // [R] on FROZEN — the freeze boundary must be evidenced.
    check(
      'ck_shipping_details__frozen_at_required',
      sql`${t.status} <> 'FROZEN' or ${t.frozenAt} is not null`,
    ),
  ],
);
