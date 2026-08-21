/**
 * The answers the Admin design-version send may give (`APP6-B09`).
 *
 * A vocabulary of its own rather than a widening of `APP6-B08`'s. The two
 * operations refuse for overlapping reasons but not the same ones: authoring
 * asks *"may a version be written"* and send asks *"may this exact version be
 * frozen and shown to the customer"*, and the second has answers the first
 * cannot have — an active review elsewhere on the case, a version that is not a
 * draft, and a placement that no longer matches what the row froze. Widening
 * B08's exhaustive `Record` would mean adding members its own use case can never
 * raise, which is how such a map stops being evidence of anything.
 *
 * Nothing here names a customer, a contact value, a secure link, a grant, a
 * token, a storage key, a document element or a constraint. `REVIEW_ALREADY_ACTIVE`
 * is the one code that reports another row's existence, and it reports only that
 * a version of **this** case is in review — which the operator can already see
 * on the version list they sent from.
 *
 * There is no `DESIGN_REVIEW` failure and no transition target in this list. The
 * request move is a projection of the committed send (`APP6-G01` §4.1, LC-11
 * `TR-LC11-08`); an operator never commands it, so no refusal can mention
 * commanding it.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const DESIGN_VERSION_SEND_FAILURES = [
  /** No such request. */
  'REQUEST_NOT_FOUND',
  /**
   * The request has no design case, or its pointer does not resolve to a case
   * that names the request back. Reported, never repaired: creating a case here
   * would hide the breakage, and rebinding a foreign one would move somebody
   * else's design thread onto this request.
   */
  'DESIGN_CASE_UNRESOLVED',
  /**
   * No version with that id **under this request's design case**.
   *
   * Deliberately the same answer for "no such version" and "that version belongs
   * to another request", exactly as `APP6-B02`/`B03` answer: the version id
   * locates a row, it does not authorize one, and telling the two apart would
   * let a wrong path confirm that a version exists on somebody else's case.
   */
  'DESIGN_VERSION_NOT_FOUND',
  /**
   * The version is not a draft, and is not the already-sent version whose send
   * would simply replay. A superseded, approved, revision-requested or voided
   * version is never re-sent — LC-08 makes a revision a new version.
   */
  'DESIGN_VERSION_NOT_SENDABLE',
  /** GRD-004: another version of this design case is already awaiting review. */
  'REVIEW_ALREADY_ACTIVE',
  // There is deliberately **no** "not the current version" refusal. LC-08's
  // `TR-LC08-02` says nothing about `design_cases.current_version_id`, G-DB7-02
  // requires only that the pointer name a version of the same case, and
  // `APP6-B08` advances it to mean "the newest authored draft" — not "the one
  // under review". Inventing the guard would also make the phase's own CC-03
  // acceptance criterion unreachable: two distinct eligible drafts on one case
  // could never race, because only one of them would ever pass it. GRD-004 is
  // what decides which draft becomes the review, and it decides it in the
  // database.
  /** The request is not in a state a design version may be sent from. */
  'REQUEST_NOT_SENDABLE',
  /** The request moved between the eligibility read and the transition. */
  'REQUEST_TRANSITION_STALE',
  /** LC-11 refused the projection. Unreachable through the guard above. */
  'INVALID_TRANSITION',
  /**
   * A Catalog version whose authoritative placement can no longer be resolved.
   * The loud failure `ADR-APP6-001` is written to force: nothing falls back to
   * another variant, side or area, and nothing converts the branch.
   */
  'PLACEMENT_AUTHORITY_UNRESOLVED',
  /**
   * What the row froze at authoring is not what the request resolves to now — a
   * different variant, side or area, changed Side geometry, a different
   * customer-owned product, or a branch that would have to switch.
   *
   * Send is the freeze boundary (`ADR-APP6-001`), so this is re-established here
   * rather than trusted from `APP6-B08`. Nothing is re-pointed to make it fit.
   */
  'PLACEMENT_FROZEN_MISMATCH',
  /**
   * The **persisted** document is not a supported DesignDocument, or no longer
   * agrees with the placement it is frozen onto. No caller-supplied document
   * reaches this operation, so this is always a statement about the stored row.
   */
  'DOCUMENT_REJECTED',
] as const;

export type DesignVersionSendFailure = (typeof DESIGN_VERSION_SEND_FAILURES)[number];

export class DesignVersionSendError extends Error {
  readonly failure: DesignVersionSendFailure;
  /**
   * How the stored document failed, when it did.
   *
   * Carried separately so the vocabulary above does not grow a member per P01
   * finding — and so the finding *paths*, which can quote customer text and
   * element ids, never travel with it.
   */
  readonly detail: string | undefined;

  constructor(failure: DesignVersionSendFailure, detail?: string) {
    super(`Design version send refused: ${failure}`);
    this.name = 'DesignVersionSendError';
    this.failure = failure;
    this.detail = detail;
  }
}

export function designVersionSendError(
  failure: DesignVersionSendFailure,
  detail?: string,
): DesignVersionSendError {
  return new DesignVersionSendError(failure, detail);
}

export function isDesignVersionSendError(error: unknown): error is DesignVersionSendError {
  return error instanceof DesignVersionSendError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 *
 * `409` where the subject exists and the operator's command is legitimate but
 * some *state* is not — those are answered by moving something, never by fixing
 * a body, and there is no body here to fix. `422` for the one case where the
 * stored artwork itself is the problem, which no retry of this call repairs.
 */
const RESPONSE_OF: Readonly<
  Record<DesignVersionSendFailure, (detail: string | undefined) => HttpException>
> = {
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  DESIGN_CASE_UNRESOLVED: () =>
    new HttpException(
      { code: 'DESIGN_CASE_UNRESOLVED', message: 'This request has no resolvable design case.' },
      HttpStatus.CONFLICT,
    ),
  DESIGN_VERSION_NOT_FOUND: () =>
    new HttpException(
      { code: 'DESIGN_VERSION_NOT_FOUND', message: 'This request has no such design version.' },
      HttpStatus.NOT_FOUND,
    ),
  DESIGN_VERSION_NOT_SENDABLE: () =>
    new HttpException(
      {
        code: 'DESIGN_VERSION_NOT_SENDABLE',
        message: 'This version cannot be sent. Draft a new version instead.',
      },
      HttpStatus.CONFLICT,
    ),
  REVIEW_ALREADY_ACTIVE: () =>
    new HttpException(
      {
        code: 'REVIEW_ALREADY_ACTIVE',
        message:
          'Another version of this design is already awaiting review. Only one version may be ' +
          'under review at a time.',
      },
      HttpStatus.CONFLICT,
    ),
  REQUEST_NOT_SENDABLE: () =>
    new HttpException(
      {
        code: 'REQUEST_NOT_SENDABLE',
        message: 'This request is not in a state a design version can be sent from.',
      },
      HttpStatus.CONFLICT,
    ),
  REQUEST_TRANSITION_STALE: () =>
    new HttpException(
      {
        code: 'REQUEST_TRANSITION_STALE',
        message: 'This request changed state before the design version could be sent.',
      },
      HttpStatus.CONFLICT,
    ),
  INVALID_TRANSITION: () =>
    new HttpException(
      {
        code: 'INVALID_TRANSITION',
        message: 'That status change is not allowed for this request.',
      },
      HttpStatus.CONFLICT,
    ),
  PLACEMENT_AUTHORITY_UNRESOLVED: () =>
    new HttpException(
      {
        code: 'PLACEMENT_AUTHORITY_UNRESOLVED',
        message:
          'This request no longer resolves to a complete catalog placement, so no version can be ' +
          'sent against it. Nothing was substituted.',
      },
      HttpStatus.CONFLICT,
    ),
  PLACEMENT_FROZEN_MISMATCH: () =>
    new HttpException(
      {
        code: 'PLACEMENT_FROZEN_MISMATCH',
        message:
          'The placement this version was drafted against no longer matches the request. Draft a ' +
          'new version against the current placement.',
      },
      HttpStatus.CONFLICT,
    ),
  DOCUMENT_REJECTED: (detail) =>
    new HttpException(
      {
        code: 'DOCUMENT_REJECTED',
        message: 'The stored design document was rejected and cannot be sent for review.',
        // The P01/P02 rejection class, which names *how* the document failed.
        // Never the findings themselves: a finding path can quote customer text
        // and an element id, and neither belongs in an error body.
        ...(detail === undefined ? {} : { reason: detail }),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedDesignVersionSend<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isDesignVersionSendError(error)) {
      throw RESPONSE_OF[error.failure](error.detail);
    }
    // Anything else propagates to the platform filter, which sanitises it. A
    // `PersistenceError` names a constraint and can quote a column; shaping one
    // into a response here is how that would reach an HTTP client.
    throw error;
  }
}
