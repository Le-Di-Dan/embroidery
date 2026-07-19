/**
 * TBL-053 `quotation_acceptances` — one secure-flow acceptance evidence of
 * one quotation version (CTX-QUO, AGG-14, `append`).
 *
 * Columns: COL-TBL053-01..05 (-02 ×3) · Constraints: CST-001, CST-038
 * (IDX-041, one acceptance per version), CST-066 instance (money
 * non-negative)
 * Relationships: REL-070 ×4 (→ quotation_versions, → customers,
 * → secure_access_grants, → contact_verification_challenges, restrict)
 * Indexes: IDX-041 (constraint-created)
 * Owner: Quotation module — the acceptance evidence only.
 *
 * **GRD-002/003/006 (grant active + step-up valid + exact current version
 * accepted, TX/App):** purpose/scope validation of the grant and the
 * step-up window, and the "exact current, unexpired version" check
 * (CST-114), are the accept transaction's concern — the FK only proves the
 * referenced grant/challenge/version exists, not that it authorizes this
 * acceptance. No raw token/OTP/hash is ever copied here (same evidence
 * class as `approval_snapshots.grant_id`/`.step_up_challenge_id`, G13).
 *
 * `accepted_total_amount` is frozen fingerprint evidence for the
 * `quotation.accept` idempotency key — a replay of the same accept call
 * returns this row's evidence rather than re-deriving it.
 *
 * Reference is to the exact **`quotation_versions.id`** — never to
 * `quotations.current_version_id` (a mutable pointer, not historical
 * authority per DB6-C4/G12/G13's own current-pointer finding).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { quotationVersions } from './quotation-versions';
import { customers } from '../customer/customers';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

export const quotationAcceptances = pgTable(
  'quotation_acceptances',
  {
    id: sequenceColumn(),
    quotationVersionId: idReference('quotation_version_id').notNull(),
    customerId: idReference('customer_id').notNull(),
    grantId: idReference('grant_id').notNull(),
    stepUpChallengeId: idReference('step_up_challenge_id').notNull(),
    acceptedTotalAmount: numeric('accepted_total_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    acceptedAt: instant('accepted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_quotation_acceptances', columns: [t.id] }),
    // CST-038 / IDX-041 — one acceptance per quotation version.
    unique('uq_quotation_acceptances__qversion').on(t.quotationVersionId),
    // REL-070 — immutable evidence child, composed under its version.
    foreignKey({
      name: 'fk_quotation_acceptances__quotation_version_id',
      columns: [t.quotationVersionId],
      foreignColumns: [quotationVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_quotation_acceptances__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // REL-070 — secure-flow evidence; purpose/scope stays TX/App.
    foreignKey({
      name: 'fk_quotation_acceptances__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_quotation_acceptances__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    check('ck_quotation_acceptances__amount_non_negative', sql`${t.acceptedTotalAmount} >= 0`),
    check('ck_quotation_acceptances__currency_vnd', sql`${t.currencyCode} = 'VND'`),
  ],
);
