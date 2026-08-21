/**
 * Why a formal Design Version could not be authored (`APP6-B08` §5, §8, §13).
 *
 * One closed vocabulary, mapped once at the HTTP edge. Each code answers a
 * question an operator can act on, and codes are **not** merged just because
 * they share a status: "this request is not in a state that may be digitized"
 * and "this request's Catalog placement can no longer be resolved" both refuse
 * the same call, but the first is answered by moving the request and the second
 * by fixing Catalog, and collapsing them would tell the operator to do neither.
 *
 * What is deliberately absent is as informative as what is present. There is no
 * `DESIGN_CASE_NOT_FOUND` taking a caller-supplied case id, because no caller
 * supplies one; there is no `BRANCH_MISMATCH`, because the branch is derived and
 * cannot be asked for; and there is no code meaning "created it anyway".
 */

export const DESIGN_VERSION_AUTHORING_ERRORS = [
  /** No such request, or none this operator may address. */
  'REQUEST_NOT_FOUND',
  /**
   * `TR-LC08-01`: the request is not `DIGITIZING` or `DESIGN_REVIEW`.
   *
   * There is no Admin override. `GRD-005` gates digitizing on an accepted
   * quotation and `APP6-B06` owns the transition into it; an authoring route
   * that could bypass the guard would make the guard advisory.
   */
  'REQUEST_NOT_DIGITIZING',
  /**
   * The request has no design case, or its pointer does not resolve.
   *
   * `APP5` creates exactly one case per request at submission (CST-020), so this
   * is a broken invariant rather than a state an operator navigated into — and it
   * is reported rather than repaired. Creating a case here would hide the
   * breakage behind a second case, and rebinding a foreign one would move
   * somebody else's design thread onto this request.
   */
  'DESIGN_CASE_UNRESOLVED',
  /**
   * A Catalog request whose authoritative placement can no longer be resolved:
   * no submitted session, no variant on the request, a purged session, or a
   * Side/Area that no longer forms one chain.
   *
   * This is the loud failure `ADR-APP6-001` is written to force. Nothing here
   * falls back to another active variant, the first side, the latest area, or an
   * unrelated Catalog row, and nothing converts the request to the
   * customer-owned branch to make the write succeed.
   */
  'CATALOG_PLACEMENT_UNRESOLVED',
  /**
   * The Admin-supplied body is not valid for the derived branch — COP placement
   * facts sent for a Catalog request, or missing for a customer-owned one.
   */
  'PLACEMENT_INPUT_INVALID',
  /** The document is malformed, too complex, or disagrees with its placement. */
  'DOCUMENT_REJECTED',
  /**
   * `APP6-A02` §6: the addressed version is not a version of this request's
   * design case.
   *
   * One code for two situations — a version id naming no row at all, and one
   * naming a row on **another** case — because they must be indistinguishable.
   * A separate "not yours" refusal would confirm that a guessed id names a real
   * design version on somebody else's request, which is the enumeration this
   * route is bound to prevent.
   *
   * Raised only by the exact-version read. Nothing authors, sends or decides
   * against a version reached this way.
   */
  'DESIGN_VERSION_NOT_FOUND',
] as const;

export type DesignVersionAuthoringErrorCode = (typeof DESIGN_VERSION_AUTHORING_ERRORS)[number];

export class DesignVersionAuthoringError extends Error {
  constructor(
    readonly code: DesignVersionAuthoringErrorCode,
    /**
     * The document rejection, when there is one.
     *
     * Carried separately rather than folded into the code so the operator learns
     * *how* the document failed without the vocabulary above growing a member
     * per P01 finding — and so the finding paths, which can quote customer text,
     * never travel with it.
     */
    readonly detail?: string,
  ) {
    super(`Design version authoring refused: ${code}`);
    this.name = 'DesignVersionAuthoringError';
  }
}
