/**
 * TBL-030 `design_reviews` — one customer review decision on a sent
 * version: approve or request revision (CTX-DSN, AGG-10, `append`).
 *
 * Columns: COL-TBL030-01..05 (-04 ×3) · Constraints: CST-001, CST-098
 * (**append-only trigger target, S24**)
 * Relationships: REL-049 (→ design_versions), REL-050 ×3 (→ customers,
 * → secure_access_grants, → contact_verification_challenges)
 * Indexes: IDX-116 (recommended, S25) → deferred, see manifest §3.1 backlog
 * Owner: Design module.
 *
 * "Pending review" is derived from the version's own `SENT_FOR_REVIEW`
 * state (LC-09) — this table has no independent state machine, only
 * append-only decision evidence. `grant_id` is NOT NULL (GRD-002: every
 * customer review action is grant-scoped); `step_up_challenge_id` is
 * nullable because step-up is required only for an APPROVE decision
 * (GRD-003) — that gate is TX/App, not a same-row CHECK, since it depends
 * on which `outcome` value is being written together with challenge state.
 * First-decision-wins (CC-04) is enforced by locking the version row in the
 * deciding transaction, not by a uniqueness constraint here.
 *
 * **Append-only** (CST-098): no `updated_at`; the S24 trigger target is not
 * yet a database mechanism (same honestly-documented gap as
 * `custom_request_transitions`/`customer_merge_events`).
 */
import { check, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { designVersions } from './design-versions';
import { customers } from '../customer/customers';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

/** LC-09 outcome closed set (DB4). */
export const DESIGN_REVIEW_OUTCOMES = ['APPROVE', 'REQUEST_REVISION'] as const;
export type DesignReviewOutcome = (typeof DESIGN_REVIEW_OUTCOMES)[number];

export const designReviews = pgTable(
  'design_reviews',
  {
    id: sequenceColumn(),
    designVersionId: idReference('design_version_id').notNull(),
    outcome: stateColumn('outcome').notNull(),
    feedback: text('feedback'),
    customerId: idReference('customer_id').notNull(),
    grantId: idReference('grant_id').notNull(),
    stepUpChallengeId: idReference('step_up_challenge_id'),
    decidedAt: instant('decided_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_reviews', columns: [t.id] }),
    // REL-049 — decision evidence is composed under the version it judges.
    foreignKey({
      name: 'fk_design_reviews__design_version_id',
      columns: [t.designVersionId],
      foreignColumns: [designVersions.id],
    }).onDelete('restrict'),
    // REL-050 — actor evidence: customer, grant, and (conditionally) the
    // step-up challenge that authorized an APPROVE decision.
    foreignKey({
      name: 'fk_design_reviews__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_reviews__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_reviews__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    check('ck_design_reviews__outcome_allowed', stateCheck(t.outcome, DESIGN_REVIEW_OUTCOMES)),
  ],
);
