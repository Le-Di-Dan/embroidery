/**
 * TBL-007 `contact_verification_attempts` — one code-entry attempt against a
 * challenge (CTX-CUS, AGG-03, `append`).
 *
 * Columns: COL-TBL007-01..03 · Constraints: CST-001, outcome closed set,
 * CST-098 (append-only trigger target, S24)
 * Relationships: REL-008 (→ challenges, **cascade-temp** — the transient
 * family is hard-TTL-deleted together)
 * Indexes: IDX-111 (P0, with group — QX-11/GRD-026 rate-limit window; the
 * table's ONLY non-PK index, append-heavy)
 * Owner: Customer module (verification aggregate).
 *
 * **An attempt row stores no code and no hash** — only the outcome and the
 * timestamp. The rate limit (GRD-026) is *derived* from attempt rows over
 * IDX-111; DB4 stores no counter, no lockout state and no next-attempt
 * timestamp on the challenge, and none is invented. No IP/device/user-agent
 * metadata exists — DB4 defines none.
 *
 * Append-only: no `updated_at`; a correction never edits history. The
 * CST-098 reject-mutation trigger lands at S24 — until then this is an
 * app/privilege expectation and DB7's reject-mutation target stays open.
 */
import { check, foreignKey, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { contactVerificationChallenges } from './contact-verification-challenges';

/** COL-TBL007-02 closed outcome set (DB4). Not the challenge lifecycle. */
export const VERIFICATION_ATTEMPT_OUTCOMES = ['MATCH', 'MISMATCH', 'EXPIRED_AT_ENTRY'] as const;
export type VerificationAttemptOutcome = (typeof VERIFICATION_ATTEMPT_OUTCOMES)[number];

export const contactVerificationAttempts = pgTable(
  'contact_verification_attempts',
  {
    id: sequenceColumn(),
    challengeId: idReference('challenge_id').notNull(),
    outcome: text('outcome').notNull(),
    attemptedAt: instant('attempted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_contact_verification_attempts', columns: [t.id] }),
    // REL-008 — cascade-temp: attempts die with their hard-TTL-deleted
    // challenge (retention class hard-ttl for the whole transient family).
    foreignKey({
      name: 'fk_contact_verification_attempts__challenge_id',
      columns: [t.challengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('cascade'),
    check(
      'ck_contact_verification_attempts__outcome_allowed',
      stateCheck(t.outcome, VERIFICATION_ATTEMPT_OUTCOMES),
    ),
    // IDX-111 — QX-11: attempts inside the rate window for one challenge.
    index('ix_verification_attempts__challenge_attempted').on(t.challengeId, t.attemptedAt),
  ],
);
