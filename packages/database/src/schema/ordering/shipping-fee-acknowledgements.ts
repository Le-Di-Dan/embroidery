/**
 * TBL-049 `shipping_fee_acknowledgements` — one customer acknowledgement
 * of a post-order shipping-fee change (CTX-ORD, AGG-15, `append`).
 *
 * Columns: COL-TBL049-01..05 (-02 ×2, -04 ×2) · Constraints: CST-001,
 * CST-066 instance (fees ≥ 0)
 * Relationships: REL-078 (→ orders, restrict), **DEV-DB6-014** (→
 * secure_access_grants, → contact_verification_challenges, restrict — the
 * one secure-flow evidence table whose sibling pattern (REL-050/053/070/
 * 080/085) DB6-C4 found missing before this group; both edges NOT NULL and
 * implemented here)
 * Indexes: none constraint-created; IDX-125 (recommended) → S25
 * Owner: Ordering module.
 *
 * **Increases only, never a silent Order mutation.** `shipping_details.
 * fee_amount` increasing after the customer has already seen the quoted
 * figure requires this acknowledgement before the higher fee is finalized
 * (`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2) — no trigger auto-accepts,
 * mutates the order total, or starts a Payment side effect from this row.
 *
 * **DEV-DB6-014, closed in this group:** `grant_id`/`step_up_challenge_id`
 * are plain evidence FKs, same class as `approval_snapshots.grant_id`/
 * `quotation_acceptances.grant_id` — no raw token/OTP/hash is copied here;
 * purpose/scope validation of the grant and step-up window stays TX/App
 * (GRD-002/003), same as every other secure-flow evidence table. Existence
 * of the referenced grant/challenge is a physical FK; that they actually
 * authorize *this* acknowledgement is TX/App, not a database guarantee.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { currencyScaleCheck } from '../../primitives/money';
import { orders } from './orders';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

export const shippingFeeAcknowledgements = pgTable(
  'shipping_fee_acknowledgements',
  {
    id: sequenceColumn(),
    orderId: idReference('order_id').notNull(),
    previousFeeAmount: numeric('previous_fee_amount', { precision: 14, scale: 2 }).notNull(),
    newFeeAmount: numeric('new_fee_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    grantId: idReference('grant_id').notNull(),
    stepUpChallengeId: idReference('step_up_challenge_id').notNull(),
    acknowledgedAt: instant('acknowledged_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_shipping_fee_acknowledgements', columns: [t.id] }),
    // REL-078 — composed under its order.
    foreignKey({
      name: 'fk_shipping_fee_acknowledgements__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // DEV-DB6-014 — secure-flow acknowledgement evidence.
    foreignKey({
      name: 'fk_shipping_fee_acknowledgements__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_shipping_fee_acknowledgements__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    check(
      'ck_shipping_fee_acknowledgements__previous_fee_non_negative',
      sql`${t.previousFeeAmount} >= 0`,
    ),
    check('ck_shipping_fee_acknowledgements__new_fee_non_negative', sql`${t.newFeeAmount} >= 0`),
    check('ck_shipping_fee_acknowledgements__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // DB6-C5 (B2) — VND has no minor unit (DEV-DB6-005).
    check(
      'ck_shipping_fee_acknowledgements__previous_fee_currency_scale',
      currencyScaleCheck(t.previousFeeAmount, t.currencyCode),
    ),
    check(
      'ck_shipping_fee_acknowledgements__new_fee_currency_scale',
      currencyScaleCheck(t.newFeeAmount, t.currencyCode),
    ),
  ],
);
