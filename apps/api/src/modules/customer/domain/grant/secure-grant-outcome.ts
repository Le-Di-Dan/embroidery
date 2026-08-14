/**
 * The bounded vocabulary of secure-grant lifecycle refusals (`APP4-B05`).
 *
 * `APP4-B05` has **zero HTTP endpoints**, so unlike `verification-http.errors.ts`
 * this file maps nothing to a status code and names no envelope code. Its
 * callers are in-process: `APP5` at request submission and, later, `APP4-B07`
 * for Admin revocation. Each of those owns its own presentation, and inventing
 * an HTTP shape here would publish a surface the checkpoint is defined not to
 * have.
 *
 * What it does own is the closed set of *reasons*. A caller has to be able to
 * distinguish "a grant is already active for this target" — which routes to
 * `reissue` — from "the target does not exist", which is a caller defect. A
 * thrown driver error cannot express that difference without also carrying the
 * `DETAIL` line, which quotes the very columns this phase keeps out of reach.
 *
 * Nothing here ever carries a token, a digest or a recipient. The reason is the
 * whole message.
 */

export const SECURE_GRANT_FAILURES = [
  /**
   * CST-009 already holds an ACTIVE grant for this (customer, request).
   *
   * Deliberately **not** a silent rotation. `issue` that quietly replaced a live
   * grant would invalidate a link the customer may be holding, on a path whose
   * caller only asked to make sure one existed. Rotation is `reissue`, which
   * says so.
   */
  'GRANT_ALREADY_ACTIVE',
  /** The named grant is absent, or no longer ACTIVE (LC-03 guard). */
  'GRANT_NOT_ACTIVE',
  /** The customer or the request the grant would bind does not exist, or is unusable. */
  'GRANT_TARGET_INVALID',
  /** A revoke arrived with a blank reason; the CHECK and the model both refuse it. */
  'GRANT_REVOKE_REASON_REQUIRED',
  /** A concurrent reissue superseded the source first; this one changed nothing. */
  'GRANT_CONCURRENT_REISSUE_LOSS',
  /** CST-008: the minted token's digest already exists. Retry mints a new one. */
  'GRANT_TOKEN_COLLISION',
  /** Notification was requested and the customer has no verified delivery target. */
  'GRANT_DELIVERY_TARGET_UNAVAILABLE',
  /** `secure_grant` is unpublished or malformed. Fail closed — issue nothing. */
  'SECURE_GRANT_POLICY_UNAVAILABLE',
] as const;

export type SecureGrantFailure = (typeof SECURE_GRANT_FAILURES)[number];

/**
 * The canonical reason a reissue writes to `revoke_reason` (ADR-DB3-004 r6 —
 * "Old token → grant `REVOKED` (reason: superseded)").
 *
 * One constant, used by both the revoke and the supersede step of the same
 * transaction, so the row's reason and its `superseded_by_grant_id` can never
 * describe two different stories.
 */
export const GRANT_SUPERSEDED_REASON = 'superseded';

/**
 * A lifecycle refusal.
 *
 * Thrown rather than returned, and that is the opposite of `APP4-B04`'s refusal
 * shape for a reason worth stating: a B04 refusal has *evidence to commit* — an
 * attempt row — so it must survive as a value. A grant refusal commits nothing
 * at all. Every path below either produces a grant or leaves the database
 * exactly as it was, so unwinding the transaction is the correct effect and a
 * throw is how this codebase asks for one.
 */
export class SecureGrantError extends Error {
  readonly failure: SecureGrantFailure;

  constructor(failure: SecureGrantFailure) {
    super(failure);
    this.name = 'SecureGrantError';
    this.failure = failure;
  }
}
