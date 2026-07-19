/**
 * TBL-051 `quotation_versions` — one immutable-once-sent quotation version:
 * full pricing snapshot including admin-entered stitch count (CTX-QUO,
 * AGG-14, `ver`).
 *
 * Columns: COL-TBL051-01..20 (-07 ×2, -09 ×2, -16 ×2, -18 ×2, -19 ×4) ·
 * Constraints: CST-001, CST-036 (IDX-039), CST-062 instance (quantity > 0),
 * CST-064 (money-arithmetic CHECKs), CST-065 (stitch count ≥ 0, GAP-10),
 * CST-066 instance (dims > 0), CST-092 (**append/immutable trigger
 * candidate, S24** — same treatment as CST-090/096)
 * Relationships: REL-066 (→ quotations, restrict), REL-067
 * (→ quotation_versions parent, self-referencing, restrict), REL-068
 * (deferred reverse pointer `quotations.current_version_id` — resolved by
 * custom SQL in this group's migration)
 * Indexes: IDX-039 (constraint-created), IDX-084 (P0 required — expiry
 * sweep, QX per DB5)
 * Owner: Quotation module.
 *
 * **GAP-10 closed:** `stitch_count` is an admin-entered pricing input,
 * never derived — there is no stitch-count engine in scope. It is NULL in
 * DRAFT; required-before-send is a send-guard (TX/App), not a CHECK, since
 * DB4 leaves the always-required question to the send transaction.
 *
 * `product_name`/`variant_label` (COL-TBL051-09) are frozen display copies
 * (Class F, INV-12) — never re-derived from the live `products`/
 * `product_variants` rows once sent.
 *
 * Money model (ADR-DB4-001, `DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` §1):
 * every `*_amount` is `numeric(14,2)` with a row-level `currency_code`
 * fixed to `'VND'` (CST-066 family); `deposit_percent` is `numeric(5,2)`.
 * `total_amount = subtotal_amount + manual_adjustment_amount +
 * shipping_fee_amount` and `deposit_amount + remaining_amount =
 * total_amount` are CHECK-enforced (CST-064) — the single derivation point
 * for the 40/60-style split is the send transaction, never a trigger.
 *
 * **CST-092 (reject-mutation once `status <> DRAFT`, except the legal
 * state advance + its own timestamp) is not yet a database mechanism** —
 * S24 owns the trigger; this group implements the CHECK/FK/index layer
 * only, same honestly-documented gap as CST-090/096.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { quotations } from './quotations';

/** LC-13 version states. Canonical source — see DB3 §"LC-12 / LC-13". */
export const QUOTATION_VERSION_STATES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'SUPERSEDED',
  'EXPIRED',
  'REJECTED',
  'VOID',
] as const;
export type QuotationVersionState = (typeof QUOTATION_VERSION_STATES)[number];

export const quotationVersions = pgTable(
  'quotation_versions',
  {
    id: idColumn().notNull(),
    quotationId: idReference('quotation_id').notNull(),
    version: integer('version').notNull(),
    parentVersionId: idReference('parent_version_id'),
    status: stateColumn().notNull(),
    stitchCount: integer('stitch_count'),
    colorCount: integer('color_count'),
    physicalWidthMm: numeric('physical_width_mm'),
    physicalHeightMm: numeric('physical_height_mm'),
    quantityTotal: integer('quantity_total').notNull(),
    productName: text('product_name'),
    variantLabel: text('variant_label'),
    subtotalAmount: numeric('subtotal_amount', { precision: 14, scale: 2 }).notNull(),
    manualAdjustmentAmount: numeric('manual_adjustment_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    adjustmentReason: text('adjustment_reason'),
    shippingFeeAmount: numeric('shipping_fee_amount', { precision: 14, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    depositPercent: numeric('deposit_percent', { precision: 5, scale: 2 }).notNull(),
    depositAmount: numeric('deposit_amount', { precision: 14, scale: 2 }).notNull(),
    remainingAmount: numeric('remaining_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    validFrom: instant('valid_from'),
    validUntil: instant('valid_until'),
    sentAt: instant('sent_at'),
    acceptedAt: instant('accepted_at'),
    supersededAt: instant('superseded_at'),
    expiredAt: instant('expired_at'),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_quotation_versions', columns: [t.id] }),
    // CST-036 / IDX-039 — version numbers never reused within a quotation.
    unique('uq_quotation_versions__quotation_version').on(t.quotationId, t.version),
    // REL-066 — versions are never deleted while their quotation exists.
    foreignKey({
      name: 'fk_quotation_versions__quotation_id',
      columns: [t.quotationId],
      foreignColumns: [quotations.id],
    }).onDelete('restrict'),
    // REL-067 — supersede/revision chain (self-referencing, nullable).
    foreignKey({
      name: 'fk_quotation_versions__parent_version_id',
      columns: [t.parentVersionId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    check('ck_quotation_versions__status_allowed', stateCheck(t.status, QUOTATION_VERSION_STATES)),
    // COL-TBL051-05/06 — GAP-10: admin-entered, never derived; not negative.
    check('ck_quotation_versions__stitch_count_non_negative', sql`${t.stitchCount} >= 0`),
    check('ck_quotation_versions__color_count_non_negative', sql`${t.colorCount} >= 0`),
    // COL-TBL051-07 — physical dimensions positive when set (nullable input).
    check(
      'ck_quotation_versions__physical_mm_positive',
      sql`(${t.physicalWidthMm} is null or ${t.physicalWidthMm} > 0) and (${t.physicalHeightMm} is null or ${t.physicalHeightMm} > 0)`,
    ),
    check('ck_quotation_versions__quantity_positive', sql`${t.quantityTotal} > 0`),
    // CST-064 — money arithmetic; single derivation point is the send tx.
    check('ck_quotation_versions__subtotal_non_negative', sql`${t.subtotalAmount} >= 0`),
    check('ck_quotation_versions__shipping_fee_non_negative', sql`${t.shippingFeeAmount} >= 0`),
    check('ck_quotation_versions__total_non_negative', sql`${t.totalAmount} >= 0`),
    check(
      'ck_quotation_versions__total_arithmetic',
      sql`${t.totalAmount} = ${t.subtotalAmount} + ${t.manualAdjustmentAmount} + ${t.shippingFeeAmount}`,
    ),
    check('ck_quotation_versions__deposit_non_negative', sql`${t.depositAmount} >= 0`),
    check('ck_quotation_versions__remaining_non_negative', sql`${t.remainingAmount} >= 0`),
    check(
      'ck_quotation_versions__deposit_remaining_arithmetic',
      sql`${t.depositAmount} + ${t.remainingAmount} = ${t.totalAmount}`,
    ),
    check(
      'ck_quotation_versions__deposit_percent_range',
      sql`${t.depositPercent} >= 0 and ${t.depositPercent} <= 100`,
    ),
    // [R] on manual adjustment — evidence for why the total was moved off-list.
    check(
      'ck_quotation_versions__adjustment_reason_required',
      sql`${t.manualAdjustmentAmount} = 0 or ${t.adjustmentReason} is not null`,
    ),
    check('ck_quotation_versions__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // COL-TBL051-18 — validity window; required at send is a TX/App guard.
    check(
      'ck_quotation_versions__validity_window',
      sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validFrom} < ${t.validUntil}`,
    ),
    // [R] on manual admin void — never sent, so no review evidence exists otherwise.
    check(
      'ck_quotation_versions__void_reason_required',
      sql`${t.status} <> 'VOID' or ${t.voidReason} is not null`,
    ),
    // IDX-084 / P0 required — expiry sweep reads SENT rows by validity deadline;
    // `now()` cannot appear in the predicate, so the sweep compares at query time.
    index('ix_quotation_versions__valid_until_id__sent')
      .on(t.validUntil, t.id)
      .where(sql`${t.status} = 'SENT'`),
  ],
);
