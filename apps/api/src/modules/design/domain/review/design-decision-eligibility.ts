/**
 * Which LC-09 state a version must be in for a customer decision, and what a
 * refusal is called when it is not (`APP6-B11` §14, §20, §26).
 *
 * ### One eligible state, two refusal vocabularies
 *
 * `TR-LC08-03` and `TR-LC08-04` both start from `SENT_FOR_REVIEW` and nowhere
 * else, so eligibility itself is not the interesting part — the *code* is. The
 * two decisions carry different guards and therefore publish different answers
 * for the identical row state:
 *
 * ```text
 *                      approval (GRD-002/003/007/008)   revision (GRD-002)
 * SENT_FOR_REVIEW      proceed                          proceed
 * APPROVED             INVALID_TRANSITION               INVALID_TRANSITION
 * REVISION_REQUESTED   INVALID_TRANSITION               INVALID_TRANSITION
 * DRAFT                APPROVAL_VERSION_MISMATCH        INVALID_TRANSITION
 * SUPERSEDED           APPROVAL_VERSION_MISMATCH        INVALID_TRANSITION
 * VOID                 APPROVAL_VERSION_MISMATCH        INVALID_TRANSITION
 * ```
 *
 * **The two decided states are `INVALID_TRANSITION` on both sides**, because
 * that is what CC-04 is: `APP6-G01` §11 says *"first decision wins"* and names
 * `INVALID_TRANSITION` for the loser. A customer whose approval lost to their
 * own revision request — or who double-submitted two different decisions — is
 * being told the decision was already made, not that the design changed.
 *
 * **The three never-decided states are `APPROVAL_VERSION_MISMATCH` for the
 * approval**, because that is what GRD-007 is: the version the customer is
 * looking at is not a version an approval may bind. `SUPERSEDED` is the CC-02
 * case named directly — something newer invalidated it — and `DRAFT` and `VOID`
 * are versions that were never shown for decision at all. The remedy for all
 * three is identical and is what the code says: re-read the current review.
 *
 * For the **revision** request every ineligible state is `INVALID_TRANSITION`,
 * and the flattening is not laziness: `TR-LC08-03` lists GRD-002 only, so this
 * surface has no GRD-007 to report and publishing `APPROVAL_VERSION_MISMATCH`
 * from it would invent a refusal the guard catalog does not give it.
 *
 * ### Where this is evaluated
 *
 * Against the **locked** version row, inside the deciding transaction, after
 * `DesignDecisionTargetResolver` has proved the row belongs to this grant's
 * case. `uq_design_versions__case__sent_for_review` then makes
 * "`SENT_FOR_REVIEW` and belongs to this case" the same statement as "is this
 * case's one active review", which is why no separate active-review query
 * exists on either path and why `design_cases.current_version_id` is never
 * consulted.
 */
import type { DesignVersionState } from '@embroidery/database';

import type { DesignDecisionFailure } from './design-decision.errors';

/** LC-09's only decidable state — the one `TR-LC08-03/04` both start from. */
export const DECIDABLE_VERSION_STATE: DesignVersionState = 'SENT_FOR_REVIEW';

/** The two states that mean *a decision has already been recorded* (CC-04). */
const ALREADY_DECIDED: readonly DesignVersionState[] = Object.freeze([
  'APPROVED',
  'REVISION_REQUESTED',
]);

export function isDecidableVersionState(status: DesignVersionState): boolean {
  return status === DECIDABLE_VERSION_STATE;
}

/**
 * The approval's refusal for a version that is not decidable.
 *
 * Never called for `SENT_FOR_REVIEW`; the caller has already tested that, and a
 * function that returned "no failure" would make the caller branch twice on one
 * fact.
 */
export function approvalRefusalFor(status: DesignVersionState): DesignDecisionFailure {
  return ALREADY_DECIDED.includes(status) ? 'INVALID_TRANSITION' : 'APPROVAL_VERSION_MISMATCH';
}
