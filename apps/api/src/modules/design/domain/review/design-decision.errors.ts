/**
 * The closed public vocabulary of the two customer design decisions
 * (`APP6-B11` §26, `APP6-G01` §4.1 and §11).
 *
 * Every code here is named by accepted authority — `DB3_TRANSITION_GUARD_CATALOG.md`
 * for GRD-007/GRD-008, `DB3_LIFECYCLE_SPECIFICATIONS.md` for LC-08, and
 * `APP6-G01` §11 for the concurrency answers. None is invented for symmetry, and
 * none is a synonym for one that already exists:
 *
 * - `SECURE_LINK_UNAVAILABLE` is **not** in this file. It belongs to APP4's
 *   `secure-link.errors.ts` and is thrown from there unchanged, so a bad token
 *   gets *the same object* on an approval as it does on `APP6-B10`'s read. A
 *   second class producing "the same" 404 would be a second place for the two to
 *   drift apart;
 * - `APPROVAL_VERSION_MISMATCH` is GRD-007's own code and **approval's alone**.
 *   `TR-LC08-03` carries no GRD-007, so a revision request can never answer it;
 * - `TERMS_NOT_ACCEPTED` is GRD-008's own code, likewise approval's alone — a
 *   revision submits no terms;
 * - `REVERIFICATION_REQUIRED` is GRD-003's, and approval's alone: `TR-LC08-03`
 *   lists GRD-002 only (`APP6-G01` §7), so the revision path never composes the
 *   step-up resolver and this code is unreachable from it;
 * - `INVALID_TRANSITION` is the CC-04 answer both decisions share. First
 *   decision wins, so the loser — approval after a revision request, a revision
 *   request after an approval, or either one repeated on a decided version —
 *   gets one answer. It is also approval's answer when the *request* row has
 *   left `DESIGN_REVIEW`.
 *
 * ### What no message says
 *
 * No message here names a customer, a contact, a grant, a token, a challenge, a
 * design case id, a version id, a request id, an agreement type, a hash, a
 * constraint or a column. Both decisions are reachable by anyone holding a link,
 * and a refusal is where the difference between "this token is real" and "this
 * token is not" leaks first. In particular `APPROVAL_VERSION_MISMATCH` says the
 * design changed and stops: which newer version exists, and how many there are,
 * is a fact about the workshop's activity on someone's order.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const DESIGN_DECISION_FAILURES = [
  /**
   * GRD-003. The grant is live and the target is right, but no `STEP_UP`
   * verification stands for this customer inside the published window.
   *
   * Distinct from `SECURE_LINK_UNAVAILABLE` on purpose, and the distinction is
   * safe: by the time this is reachable the caller has already proved possession
   * of a live grant for this request, so it learns nothing it did not hold.
   * Collapsing the two would tell a customer whose link works that their link
   * does not work, and would leave the screen with no way to offer the one
   * action that resolves it.
   *
   * Approval only.
   */
  'REVERIFICATION_REQUIRED',
  /**
   * GRD-007. The submitted version is not one this approval may bind: the hash
   * does not match what was sent, or the version is no longer approval-eligible
   * because something newer superseded it (CC-02).
   *
   * Approval only. The remedy is always the same — re-read the current review
   * and decide again — which is why the two halves share one code.
   */
  'APPROVAL_VERSION_MISMATCH',
  /**
   * GRD-008. The submitted agreement evidence is not exactly the effective
   * required set: a required type is missing, an extra one was sent, a version
   * id is stale, a content hash does not match persistence, or the same
   * agreement was submitted twice.
   *
   * Approval only. The customer must re-read the terms and decide again, which
   * is one screen and one action rather than six different diagnostics.
   */
  'TERMS_NOT_ACCEPTED',
  /**
   * LC-08 does not permit the decision from where the version now stands, or
   * LC-11 does not permit `DESIGN_REVIEW → APPROVED` from where the request now
   * stands.
   *
   * The CC-04 loser's answer, both directions. `APP6-G01` §11 names it for
   * "approval vs revision request … first decision wins".
   */
  'INVALID_TRANSITION',
  /** GRD-012 — another approval of this exact version is mid-flight. Retryable. */
  'DUPLICATE_OPERATION',
  /**
   * GRD-030 — the `design.approve` scope was claimed for a different
   * fingerprint: this version is being, or has been, approved against a
   * different document hash or a different set of terms.
   */
  'IDEMPOTENCY_CONFLICT',
  /**
   * The `secure_grant` policy is unpublished or unusable, so the step-up window
   * has no length and GRD-003 cannot be evaluated. Nothing about the request is
   * wrong, and the condition is one operator action away from resolved.
   */
  'DECISION_POLICY_UNAVAILABLE',
  /**
   * The server cannot describe the approval it is being asked to freeze: a
   * Catalog product, side or area the version names no longer resolves, or the
   * request carries no quantity line at all.
   *
   * Unreachable through the delivered paths — every placement FK is `restrict`
   * and a submitted request always carries a breakdown — and mapped anyway,
   * because `approval_snapshots` has `NOT NULL` display copies and a positive
   * quantity CHECK, and the alternative to refusing is fabricating exactly the
   * values that would satisfy them. A `503` and not a `409`: nothing the
   * customer sent is wrong.
   */
  'APPROVAL_EVIDENCE_UNRESOLVED',
] as const;

export type DesignDecisionFailure = (typeof DESIGN_DECISION_FAILURES)[number];

export class DesignDecisionError extends Error {
  readonly failure: DesignDecisionFailure;

  constructor(failure: DesignDecisionFailure) {
    super(failure);
    this.name = 'DesignDecisionError';
    this.failure = failure;
  }
}

export function designDecisionError(failure: DesignDecisionFailure): DesignDecisionError {
  return new DesignDecisionError(failure);
}

export function isDesignDecisionError(error: unknown): error is DesignDecisionError {
  return error instanceof DesignDecisionError;
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
 * `403` for `REVERIFICATION_REQUIRED` rather than `401`, on `APP6-B05`'s
 * reasoning: the caller *is* authenticated as far as this surface has an
 * identity at all, and there is no `WWW-Authenticate` challenge a browser could
 * act on. The remedy is a separate APP4 verification round, which the code
 * names.
 *
 * `409` for the four conflict-class refusals: none is fixed by editing the body,
 * and all four are statements about what some other actor already did.
 *
 * `503` for the two server-side ones, with **no code in the body** — the message
 * is deliberately opaque, because an unpublished policy key and an unresolvable
 * Catalog row are server-configuration detail.
 */
const REFUSAL_OF: Readonly<Record<DesignDecisionFailure, PublicRefusal>> = {
  REVERIFICATION_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Please confirm your contact again before approving this design.',
  },
  APPROVAL_VERSION_MISMATCH: {
    status: HttpStatus.CONFLICT,
    message: 'This design has changed. Please review it again before approving.',
  },
  TERMS_NOT_ACCEPTED: {
    status: HttpStatus.CONFLICT,
    message: 'The current terms were not accepted. Please read them again and confirm.',
  },
  INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'This design can no longer be decided on.',
  },
  DUPLICATE_OPERATION: {
    status: HttpStatus.CONFLICT,
    message: 'This decision is already being processed. Please try again in a moment.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'This design version was already decided differently.',
  },
  DECISION_POLICY_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Deciding on a design is temporarily unavailable.',
  },
  APPROVAL_EVIDENCE_UNRESOLVED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Approving this design is temporarily unavailable.',
  },
};

/** The two opaque server-side answers carry a message and deliberately no code. */
const OPAQUE: ReadonlySet<DesignDecisionFailure> = new Set<DesignDecisionFailure>([
  'DECISION_POLICY_UNAVAILABLE',
  'APPROVAL_EVIDENCE_UNRESOLVED',
]);

export function designDecisionResponse(failure: DesignDecisionFailure): HttpException {
  const refusal = REFUSAL_OF[failure];
  return OPAQUE.has(failure)
    ? new HttpException({ message: refusal.message }, refusal.status)
    : new HttpException({ code: failure, message: refusal.message }, refusal.status);
}
