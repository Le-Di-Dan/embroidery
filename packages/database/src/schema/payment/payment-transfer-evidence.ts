/**
 * TBL-079 `payment_transfer_evidence` — one attempt↔asset association: a
 * customer-supplied bank-transfer screenshot submitted against exactly one
 * payment attempt (CTX-PAY, AGG-16, `assoc`).
 *
 * Columns: 2 business + convention · Constraints: CST-001, CST-043
 * Relationships: REL-109 ×2 (→ payment_attempts, → assets)
 * Indexes: constraint-created only — the PK index and the pair UNIQUE, whose
 * `payment_attempt_id` prefix already serves both later access paths
 * (evidence-by-attempt listing and the exact-pair resolve). No `IDX-*` slot
 * is allocated: the DB5 register is the launch access-path catalog and no
 * explicit index is added here
 * Owner: Payment module — the association only; Asset owns the binary, its
 * media type, its byte size and its object key, and none of them is copied
 * here.
 *
 * Added by `APP7-DB01` under `PO-APP7-001` / `APP7-G01` §7, after the DB4
 * table catalogue was closed. `ADR-DB4-003` forbids a generic `asset_links`
 * table and requires each consuming context to own a typed association with
 * `NOT NULL`, `restrict` foreign keys on both ends; no delivered association
 * belongs to Payment, and `payment_attempts` cannot carry a single `asset_id`
 * because up to five images are allowed per attempt.
 *
 * **No `role` column.** The table has exactly one meaning, and a discriminator
 * with a single legal value is an abstraction for hypothetical reuse
 * (`CLAUDE.md` §5). It is the divergence from `custom_request_assets`, whose
 * `role` set is a closed CHECK.
 *
 * **The five-per-attempt bound is not here.** `APP7-G01` §7.2 fixes
 * `MAX_EVIDENCE_PER_ATTEMPT = 5` as an application guard evaluated under the
 * payment-attempt row lock, exactly as `MAX_ACCEPTED_UPLOADS_PER_CHALLENGE` is
 * enforced today. A CHECK cannot count sibling rows, and no trigger family is
 * invented for it — the database must accept a sixth row and `APP7-B05` must
 * refuse it.
 *
 * **Append-only and retain-class.** Evidence submitted before a verification
 * decision must survive it, or the record of what the Admin actually looked at
 * is destroyed. Both FKs are `restrict`, so neither an attempt nor a referenced
 * asset can be hard-deleted out from under the association; asset disposal goes
 * through the G4 tombstone flow, which sees this row. `created_at` is the
 * submission instant — no second `submitted_at`, and no `updated_at`, because
 * nothing ever updates an association row.
 *
 * The grant and the step-up challenge that authorized the submission are
 * **not** duplicated here: `payment_attempts.grant_id` and
 * `payment_attempts.step_up_challenge_id` already hold them, and evidence
 * never migrates between attempts (a retry is a new attempt, LC-16).
 */
import { foreignKey, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { paymentAttempts } from './payment-attempts';
import { assets } from '../asset/assets';

export const paymentTransferEvidence = pgTable(
  'payment_transfer_evidence',
  {
    id: idColumn().notNull(),
    paymentAttemptId: idReference('payment_attempt_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_payment_transfer_evidence', columns: [t.id] }),
    // CST-043 — one association per (attempt, asset). Deliberately
    // not unique on `payment_attempt_id` alone: an attempt may carry several
    // distinct evidence images. Deliberately not unique on `asset_id` alone
    // either — no Asset authority requires a binary to belong to exactly one
    // consuming association globally, and the sibling associations do not.
    unique('uq_payment_transfer_evidence__attempt_asset').on(t.paymentAttemptId, t.assetId),
    foreignKey({
      name: 'fk_payment_transfer_evidence__payment_attempt_id',
      columns: [t.paymentAttemptId],
      foreignColumns: [paymentAttempts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_payment_transfer_evidence__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
  ],
);
