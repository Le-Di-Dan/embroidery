/**
 * TBL-055 `payment_attempts` — one payment attempt against one obligation
 * (CTX-PAY, AGG-16, `entity`, mutable).
 *
 * Columns: COL-TBL055-01..11 (-08 ×2, -10 ×2) · Constraints: CST-001,
 * CST-063 instance (amount > 0), CST-068 (currency 'VND')
 * Relationships: REL-084 (→ payment_obligations, restrict — allocation =
 * this FK, CON-106), REL-085 (→ secure_access_grants, →
 * contact_verification_challenges, nullable, restrict — customer
 * initiation evidence)
 * Indexes: IDX-076 (P0 required — failed/review queue), IDX-077 (P0
 * required — obligation-scoped lookup); IDX-078 (recommended) → S25
 * Owner: Payment module.
 *
 * **Provider-abstract.** `method`/`provider_key`/`provider_ref` never
 * assume a specific payment provider's shape (O-006) — provider-specific
 * fields live in `payment_provider_events.redacted_payload`, never here.
 * `status` follows LC-16's machine: the out-of-order rule (terminal states
 * never regress; a callback for an already-terminal attempt is recorded as
 * a `payment_provider_events` row but applies nothing) is TX/App and DB8's
 * concurrency concern (CC-07/08/09/10) — no trigger enforces it.
 * `review_reason` is required-with-evidence on `REQUIRES_REVIEW` entry, the
 * same same-row conditional pattern already used for `orders.hold_reason`.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { paymentObligations } from './payment-obligations';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

/** COL-TBL055-04 closed method set (DB4, provider-abstract, O-006). */
export const PAYMENT_ATTEMPT_METHODS = ['PROVIDER_REDIRECT', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentAttemptMethod = (typeof PAYMENT_ATTEMPT_METHODS)[number];

/** LC-16. Canonical source — see DB5-A09. */
export const PAYMENT_ATTEMPT_STATES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'REQUIRES_REVIEW',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentAttemptState = (typeof PAYMENT_ATTEMPT_STATES)[number];

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: idColumn().notNull(),
    paymentObligationId: idReference('payment_obligation_id').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    method: text('method').notNull(),
    providerKey: text('provider_key'),
    providerRef: text('provider_ref'),
    status: stateColumn().notNull(),
    grantId: idReference('grant_id'),
    stepUpChallengeId: idReference('step_up_challenge_id'),
    expiresAt: instant('expires_at'),
    succeededAt: instant('succeeded_at'),
    failedAt: instant('failed_at'),
    reviewReason: text('review_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_payment_attempts', columns: [t.id] }),
    // REL-084 — allocation: an attempt targets exactly one obligation (CON-106).
    foreignKey({
      name: 'fk_payment_attempts__payment_obligation_id',
      columns: [t.paymentObligationId],
      foreignColumns: [paymentObligations.id],
    }).onDelete('restrict'),
    // REL-085 — customer-initiation evidence (GRD-002/003); purpose/scope TX/App.
    foreignKey({
      name: 'fk_payment_attempts__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_payment_attempts__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    check('ck_payment_attempts__method_allowed', stateCheck(t.method, PAYMENT_ATTEMPT_METHODS)),
    check('ck_payment_attempts__status_allowed', stateCheck(t.status, PAYMENT_ATTEMPT_STATES)),
    // CST-063 — attempt amounts are strictly positive.
    check('ck_payment_attempts__amount_positive', sql`${t.amount} > 0`),
    check('ck_payment_attempts__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // COL-TBL055-11 — [R] REQUIRES_REVIEW entry/resolution context.
    check(
      'ck_payment_attempts__review_reason_required',
      sql`${t.status} <> 'REQUIRES_REVIEW' or ${t.reviewReason} is not null`,
    ),
    // IDX-076 — failed/review queue, most-recent first.
    index('ix_payment_attempts__created_id__failed_review')
      .on(t.createdAt.desc(), t.id.desc())
      .where(sql`${t.status} in ('FAILED', 'REQUIRES_REVIEW')`),
    // IDX-077 — obligation-scoped attempt lookup.
    index('ix_payment_attempts__payment_obligation_id').on(t.paymentObligationId),
  ],
);
