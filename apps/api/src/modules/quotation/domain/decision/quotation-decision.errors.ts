/**
 * The closed public vocabulary of the two customer quotation decisions
 * (`APP6-B05` §20, `APP6-G01` §4.1 and §11).
 *
 * Every code here is named by accepted authority. None is invented for
 * symmetry, and none is a synonym for one that already exists:
 *
 * - `SECURE_LINK_UNAVAILABLE` is **not** in this file. It belongs to APP4's
 *   `secure-link.errors.ts` and is thrown from there unchanged, because the
 *   non-disclosure property is that a bad token gets *the same object* on a
 *   write as it does on a read. A second class producing "the same" 404 would be
 *   a second place for the two to drift apart;
 * - `QUOTE_VERSION_STALE` covers CC-05 **and** CC-06. The authority assigns one
 *   code to both, and the merge is deliberate: "someone re-quoted you" and "your
 *   offer lapsed" have the same remedy — re-read and decide again — and telling
 *   a caller which one happened tells them something about the workshop's
 *   activity on a request the token may not really be for;
 * - `INVALID_TRANSITION` is rejection's whole refusal surface, per `APP6-G01`
 *   §10: the version's terminal state is the record, so a repeat rejection, a
 *   rejection of a superseded version and a rejection of an accepted one are one
 *   answer. It is also acceptance's answer when the *request* row has moved
 *   somewhere `QUOTED → QUOTE_ACCEPTED` cannot start from.
 *
 * ### What no message says
 *
 * No message here names a customer, a contact, a grant, a token, a challenge, a
 * quotation id, a version id, a request id, an amount, a constraint or a column.
 * The two decisions are reachable by anyone holding a link, and a refusal is
 * where the difference between "this token is real" and "this token is not"
 * leaks first.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const QUOTATION_DECISION_FAILURES = [
  /**
   * GRD-003. The grant is live and the target is right, but no `STEP_UP`
   * verification stands for this customer inside the published window.
   *
   * Distinct from `SECURE_LINK_UNAVAILABLE` on purpose, and the distinction is
   * safe: the caller has *already* proved possession of a live grant for this
   * request by the time this can be reached, so it learns nothing it did not
   * hold. Collapsing the two would be worse than useless — a customer whose
   * link works would be told their link does not work, and the screen would have
   * no way to offer the one action that resolves it.
   *
   * Acceptance only. `TR-LC12-06` lists GRD-002 alone, so rejection can never
   * answer this.
   */
  'REVERIFICATION_REQUIRED',
  /**
   * GRD-006, both halves (CC-05 and CC-06). The version the customer decided on
   * is no longer the current sent one, or its validity window has closed.
   * Acceptance only.
   */
  'QUOTE_VERSION_STALE',
  /**
   * LC-11 or LC-12 does not permit the move from where the row now stands.
   * Acceptance reports it when the Custom Request has left `QUOTED`; rejection
   * reports it for every version state `TR-LC12-06` cannot start from.
   */
  'INVALID_TRANSITION',
  /** GRD-012 — another acceptance of this exact version is mid-flight. Retryable. */
  'DUPLICATE_OPERATION',
  /**
   * GRD-030 — the `quotation.accept` scope was claimed for a different
   * fingerprint. Unreachable while a sent version's total is frozen, and mapped
   * anyway: an unmapped guard reaches a client as a 500.
   */
  'IDEMPOTENCY_CONFLICT',
  /**
   * The `secure_grant` policy is unpublished or unusable, so the step-up window
   * has no length and GRD-003 cannot be evaluated. Nothing about the request is
   * wrong, and the condition is one operator action away from resolved.
   */
  'DECISION_POLICY_UNAVAILABLE',
] as const;

export type QuotationDecisionFailure = (typeof QUOTATION_DECISION_FAILURES)[number];

export class QuotationDecisionError extends Error {
  readonly failure: QuotationDecisionFailure;

  constructor(failure: QuotationDecisionFailure) {
    super(failure);
    this.name = 'QuotationDecisionError';
    this.failure = failure;
  }
}

export function quotationDecisionError(failure: QuotationDecisionFailure): QuotationDecisionError {
  return new QuotationDecisionError(failure);
}

export function isQuotationDecisionError(error: unknown): error is QuotationDecisionError {
  return error instanceof QuotationDecisionError;
}

interface PublicRefusal {
  readonly status: HttpStatus;
  readonly message: string;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record`, so adding a failure without giving it a status stops
 * compiling — the only way a new refusal cannot reach a client as an unmapped
 * 500.
 *
 * `403` for `REVERIFICATION_REQUIRED` rather than `401`: the caller *is*
 * authenticated as far as this surface has an identity at all — it holds a live
 * grant — and there is no `WWW-Authenticate` challenge a browser could act on.
 * The remedy is a separate APP4 verification round, which the code names.
 *
 * `409` for the four conflict-class refusals: none of them is fixed by editing
 * the body, and all four are statements about what some other actor already did.
 *
 * `503` for the unpublished policy, on the `APP6-B01` / `APP6-B03` precedent,
 * with **no code in the body** — the message is deliberately opaque, because the
 * fact that a policy key is missing is server-configuration detail.
 */
const REFUSAL_OF: Readonly<Record<QuotationDecisionFailure, PublicRefusal>> = {
  REVERIFICATION_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Please confirm your contact again before accepting this quotation.',
  },
  QUOTE_VERSION_STALE: {
    status: HttpStatus.CONFLICT,
    message: 'This quotation has changed. Please review it again before deciding.',
  },
  INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'This quotation can no longer be decided on.',
  },
  DUPLICATE_OPERATION: {
    status: HttpStatus.CONFLICT,
    message: 'This decision is already being processed. Please try again in a moment.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'This quotation version was already decided differently.',
  },
  DECISION_POLICY_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Deciding on a quotation is temporarily unavailable.',
  },
};

export function quotationDecisionResponse(failure: QuotationDecisionFailure): HttpException {
  const refusal = REFUSAL_OF[failure];
  return failure === 'DECISION_POLICY_UNAVAILABLE'
    ? new HttpException({ message: refusal.message }, refusal.status)
    : new HttpException({ code: failure, message: refusal.message }, refusal.status);
}
