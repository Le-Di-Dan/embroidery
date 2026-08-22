/**
 * What the single re-read means, once it lands (`APP6-S02` §13, §14, §15, §19).
 *
 * The controller owns *issuing* one re-read and never more than one; this owns
 * *reading its answer*. The split is not tidiness: deciding whether a completed
 * step-up may return the customer to their confirmation is the rule the whole
 * checkpoint turns on, and a rule that lives inside an effect can only be
 * tested by driving a component through six states to reach it. Here it is a
 * function, so each of its four answers is asserted by calling it.
 *
 * ## Why one re-read serves four different follow-ups
 *
 * The read itself is identical every time — B10, one token, no side effect.
 * What differs is the question being asked of the answer, and that is what
 * {@link ReconcileReason} records:
 *
 * | reason     | raised by                                        | answer |
 * |------------|--------------------------------------------------|--------|
 * | `STEP_UP`  | a completed re-verification                       | compared against the captured intent |
 * | `MISMATCH` | `409 APPROVAL_VERSION_MISMATCH`                   | always a new design |
 * | `TERMS`    | `409 TERMS_NOT_ACCEPTED`                          | always new terms |
 * | `NOTICE`   | `409 INVALID_TRANSITION` / `IDEMPOTENCY_CONFLICT` | current truth, with the reason stated |
 *
 * The two refusals that name their own outcome do not re-derive it from the
 * payload. `GRD-007` and `GRD-008` are the server's verdicts on the submission
 * that was actually made; a client that re-compared and found the values equal
 * — because the workshop moved twice, or because the read raced the write —
 * would talk the customer out of a refusal that really happened.
 */
import type { AgreementIdentity } from './design-review-consent';
import { agreementSignatureOf } from './design-review-consent';
import type { ApprovalIntent } from './design-review-state';

/** Why the one in-flight re-read was issued. */
export type ReconcileReason = 'STEP_UP' | 'MISMATCH' | 'TERMS' | 'NOTICE';

/**
 * What the screen must do now.
 *
 * `SAME_REVIEW` is deliberately not "approved": a completed step-up is
 * evidence, never consent, so the best outcome available here is *return the
 * customer to the confirmation they must press again*.
 */
export type ReconcileVerdict = 'SAME_REVIEW' | 'NEW_VERSION' | 'NEW_TERMS' | 'NOTICE';

/** The facts about the re-read review this decision needs, and only those. */
export interface ReconciledReview {
  readonly designVersionId: string;
  readonly documentHash: string;
  readonly agreements: readonly AgreementIdentity[];
}

/**
 * Reads the verdict of the one completed re-read.
 *
 * For a step-up the comparison is against the **captured intent** — the version
 * and the stored hash the customer actually looked at — and never against
 * whatever was current a moment ago. Both fields are compared, not one: a new
 * version id with a coincidentally equal hash and an unchanged id whose hash
 * moved are each a different design from the one that was reviewed, and
 * checking either field alone would let one of the two through.
 *
 * The agreement set is compared only once the design has been found unchanged,
 * because that ordering *is* the distinction §13 draws. A design change makes
 * the terms question moot — the customer must review new artwork from scratch —
 * while a terms change on unchanged artwork must not be reported as a design
 * mismatch, which would tell the customer their drawing moved when it did not.
 *
 * A missing intent resolves to `NEW_VERSION`. There is nothing left to compare
 * against, and the safe answer to "is this still the design they approved?"
 * when the question cannot be answered is *no*.
 */
export function reconcileVerdict(
  reason: ReconcileReason,
  intent: ApprovalIntent | undefined,
  review: ReconciledReview,
): ReconcileVerdict {
  if (reason === 'MISMATCH') return 'NEW_VERSION';
  if (reason === 'TERMS') return 'NEW_TERMS';
  if (reason === 'NOTICE') return 'NOTICE';

  if (intent === undefined) return 'NEW_VERSION';
  const sameDesign =
    review.designVersionId === intent.versionId && review.documentHash === intent.documentHash;
  if (!sameDesign) return 'NEW_VERSION';

  return agreementSignatureOf(review.agreements) === intent.agreementSignature
    ? 'SAME_REVIEW'
    : 'NEW_TERMS';
}

/**
 * Whether this verdict destroys the approval the customer had in play.
 *
 * Three of the four do. Expressed once, here, so the controller cannot clear
 * the intent on one path and forget it on another — the failure mode being an
 * approval that survives the discovery that its design has changed.
 */
export function verdictClearsDecision(verdict: ReconcileVerdict): boolean {
  return verdict !== 'SAME_REVIEW';
}
