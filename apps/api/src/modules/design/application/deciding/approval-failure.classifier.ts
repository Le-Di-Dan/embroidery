/**
 * The persistence verdicts the approval owns, translated to its public
 * vocabulary (`APP6-B11` §26).
 *
 * Split from the use case because it answers a different question. The use case
 * decides *what may happen*; this decides *what a failure is called* — and the
 * mapping is the checkpoint's error contract, which a reviewer should be able to
 * read as one table rather than reconstruct from a chain of `if`s at the bottom
 * of a transaction.
 *
 * ### Only the codes this checkpoint owns
 *
 * Everything unmatched travels as itself to the platform filter, which sanitises
 * it. Shaping an unknown error into a bounded refusal here is how a defect
 * reaches a client as an ordinary "please fix your request", and how a
 * `PersistenceError` — whose diagnostics name a constraint and can quote a
 * column — reaches a public surface.
 *
 * ### The two guards, seen from inside persistence
 *
 * Each database code below is one of the same two guards the use case already
 * checked in process, arriving at the row instead of at the pre-check. That
 * redundancy is the design: the in-process checks make refusals *legible*, and
 * these make them *true* under concurrency.
 *
 * ```text
 * DESIGN_VERSION_NOT_IN_REVIEW      CC-04 at the conditional UPDATE
 * DESIGN_VERSION_ALREADY_APPROVED   CC-04 at uq_approval_snapshots__version
 * STALE_TRANSITION / INVALID_...    LC-11 at the guarded transition
 *   -> INVALID_TRANSITION           "the decision was already made"
 *
 * APPROVAL_VERSION_MISMATCH         G-DB7-14 inside createFromVersion
 * DESIGN_VERSION_NOT_APPROVABLE     the version left SENT_FOR_REVIEW mid-flight
 * DESIGN_VERSION_NOT_HASHED         a row that reached review without a hash
 *   -> APPROVAL_VERSION_MISMATCH    "the design changed; read it again"
 * ```
 *
 * `SecureGrantError` is the odd one out and is not a guard at all: the
 * `secure_grant` policy is unpublished or unusable, so GRD-003's window has no
 * length. A `503`, not a refusal of the customer's decision.
 */
import { isPersistenceError } from '@embroidery/database';

import { SecureGrantError } from '../../../customer/domain/grant/secure-grant-outcome';
import {
  designDecisionError,
  type DesignDecisionFailure,
} from '../../domain/review/design-decision.errors';

/**
 * The persistence codes this checkpoint maps, and what each becomes.
 *
 * A `Record` rather than a chain, so the contract is one readable table and a
 * code cannot be silently matched twice by two overlapping branches.
 */
const FAILURE_OF_CODE: Readonly<Record<string, DesignDecisionFailure>> = {
  // CC-04 — first decision wins, whichever decision it was.
  DESIGN_VERSION_NOT_IN_REVIEW: 'INVALID_TRANSITION',
  DESIGN_VERSION_ALREADY_APPROVED: 'INVALID_TRANSITION',
  STALE_TRANSITION: 'INVALID_TRANSITION',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  // GRD-007 / G-DB7-14 — the design is not the one this approval may bind.
  APPROVAL_VERSION_MISMATCH: 'APPROVAL_VERSION_MISMATCH',
  DESIGN_VERSION_NOT_APPROVABLE: 'APPROVAL_VERSION_MISMATCH',
  DESIGN_VERSION_NOT_HASHED: 'APPROVAL_VERSION_MISMATCH',
  // GRD-008 / G-DB7-16 — the repository's own last-line terms check.
  TERMS_NOT_ACCEPTED: 'TERMS_NOT_ACCEPTED',
  // GRD-012 / GRD-030 — the delivered claim mechanism's two verdicts.
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_RECORD_VANISHED: 'DUPLICATE_OPERATION',
};

/** Translates what this checkpoint owns, and passes everything else through. */
export function classifyApprovalFailure(error: unknown): unknown {
  if (isPersistenceError(error)) {
    const failure = FAILURE_OF_CODE[error.code];
    if (failure !== undefined) {
      return designDecisionError(failure);
    }
  }
  if (error instanceof SecureGrantError) {
    return designDecisionError('DECISION_POLICY_UNAVAILABLE');
  }
  return error;
}
