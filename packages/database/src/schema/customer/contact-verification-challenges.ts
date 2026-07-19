/**
 * TBL-006 `contact_verification_challenges` — one OTP challenge for one
 * contact target + purpose (CTX-CUS, AGG-03, `temp`).
 *
 * Columns: COL-TBL006-01..09 · Constraints: CST-001, CST-007 (IDX-006),
 * CST-060 (LC-02), purpose closed set
 * Relationships: REL-006 (→ customer_contact_points, nullable),
 * REL-007 (→ design_sessions, nullable, SET NULL)
 * Indexes: IDX-006 (explicit partial unique — the CC-17 arbiter),
 * IDX-112 (P0 expiry sweep, with group); IDX-130 (recommended, S25)
 * Owner: Customer module (verification aggregate).
 *
 * **Verification precedes Customer creation** (ADR-DB2-001): a
 * submission-time challenge targets a raw normalized destination before any
 * customer or contact point exists, so `contact_point_id` is nullable by
 * design and no FK is forced against the lifecycle. Success is *evidence*
 * consumed by later customer creation/linking — this table never creates a
 * customer, a contact point, or a grant, and it is not an account: no
 * password, no login credential, no permanent identity.
 *
 * **`code_hash` stores only the one-way representation of the OTP** (D7-12:
 * plaintext never stored). DB4 defines no algorithm/version/salt columns and
 * CST-070's format check covers document/content/preview/checksum hashes —
 * not this column — so it stays an opaque bounded value with **no format
 * CHECK, no index, and no lookup path**: challenges are found by id or by
 * target+purpose, never by hash (low-entropy guardrail). Hashing/KDF and
 * constant-time comparison are application-security-owned, outside DB6.
 *
 * CST-007 is the single-open-challenge arbiter: one `ISSUED` row per
 * (kind, normalized value, purpose). Expiry does **not** remove a row from
 * the partial index — the issue transaction must first mark the stale row
 * EXPIRED, then insert, handling 23505 as the concurrent-issuer loss
 * (CC-17). `expires_at` is compared to `now()` only in queries (DB5-A03);
 * the whole family is hard-TTL-deleted, which cascades attempts (REL-008).
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customerContactPoints } from './customer-contact-points';
import { designSessions } from '../design/design-sessions';

/** LC-02. Canonical source — see DB5-A09. */
export const VERIFICATION_CHALLENGE_STATES = [
  'ISSUED',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type VerificationChallengeState = (typeof VERIFICATION_CHALLENGE_STATES)[number];

/** COL-TBL006-04 closed purpose set (DB4). A type, not a lifecycle. */
export const VERIFICATION_PURPOSES = ['SUBMISSION', 'STEP_UP'] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const contactVerificationChallenges = pgTable(
  'contact_verification_challenges',
  {
    id: idColumn().notNull(),
    contactPointId: idReference('contact_point_id'),
    contactKind: text('contact_kind').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    purpose: text('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at').notNull(),
    verifiedAt: instant('verified_at'),
    sessionId: idReference('session_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_contact_verification_challenges', columns: [t.id] }),
    // REL-006 — nullable: pre-customer challenges carry only the raw target.
    // Contact points are anonymize-class (never hard-deleted) → restrict.
    foreignKey({
      name: 'fk_contact_verification_challenges__contact_point_id',
      columns: [t.contactPointId],
      foreignColumns: [customerContactPoints.id],
    }).onDelete('restrict'),
    // REL-007 — submission-flow binding; the session parent is hard-TTL
    // deleted, so the pointer clears (`set-null-cand`, same reasoning as the
    // REL-033 session edge in 0010).
    foreignKey({
      name: 'fk_contact_verification_challenges__session_id',
      columns: [t.sessionId],
      foreignColumns: [designSessions.id],
    }).onDelete('set null'),
    // CST-007 / IDX-006 — one open challenge per (target, purpose); the
    // CC-17 arbiter for concurrent issuance.
    uniqueIndex('uq_verification_challenges__kind_value_purpose__issued')
      .on(t.contactKind, t.normalizedValue, t.purpose)
      .where(sql`${t.status} = 'ISSUED'`),
    check(
      'ck_contact_verification_challenges__status_allowed',
      stateCheck(t.status, VERIFICATION_CHALLENGE_STATES),
    ),
    check(
      'ck_contact_verification_challenges__purpose_allowed',
      stateCheck(t.purpose, VERIFICATION_PURPOSES),
    ),
    // COL-TBL006-02 shares the contact-kind closed set with TBL-005.
    check(
      'ck_contact_verification_challenges__contact_kind_allowed',
      sql`${t.contactKind} in ('EMAIL', 'PHONE')`,
    ),
    // IDX-112 — expiry sweep over open challenges; `now()` stays in the query.
    index('ix_verification_challenges__expires_id__issued')
      .on(t.expiresAt, t.id)
      .where(sql`${t.status} = 'ISSUED'`),
  ],
);
