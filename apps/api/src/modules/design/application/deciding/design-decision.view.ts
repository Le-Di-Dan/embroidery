/**
 * The customer-safe projections of the two design decisions (`APP6-B11` §5).
 *
 * Transport-free view types, so the use cases decide what a customer may see and
 * the controller decides only how to serialise it — the split
 * `CustomerDesignReviewView` (`APP6-B10`) and `QuotationAcceptedView`
 * (`APP6-B05`) established for the same surface.
 *
 * ### What is absent from both, and why
 *
 * - no `designCaseId` — an internal thread id the customer has no use for and
 *   no route accepts;
 * - no Design Document and no element — the customer already has it; echoing it
 *   back would put a second copy of the approved artwork on the wire for no
 *   reader;
 * - no grant id, token, digest, contact or customer id — the grant authorised
 *   the decision and is never echoed by it;
 * - no step-up challenge id. It is server-derived (GRD-003, `APP6-B11` §7) and
 *   returning it would hand a client the one value the body deliberately refuses
 *   to accept, which is how a "read it back and send it next time" pattern
 *   starts;
 * - no storage key, bucket, provider URL, derivative id or preview hash — B11
 *   renders nothing and streams nothing;
 * - no order id, payment obligation or reservation. APP6 stops at
 *   `design.approved` (`APP6-G01` §9); a field here would be a surface for
 *   APP7's work to leak through before it exists.
 */

/** The committed approval, or a replay of an earlier identical one. */
export interface DesignApprovedView {
  readonly versionId: string;
  /** Monotonic within the design case. Display only; never an input anywhere. */
  readonly version: number;
  readonly versionStatus: string;
  /**
   * The Approval Snapshot this approval created — the immutable evidence
   * everything downstream is authorised by, and the id `SE-005` announces.
   */
  readonly approvalSnapshotId: string;
  /** The stored `APP6-B09` hash, read back off the frozen row. */
  readonly documentHash: string;
  /**
   * The request's LC-11 state after `TR-LC11-09`.
   *
   * Present because the customer's screen must be able to say what happened to
   * their order, and because the projection genuinely committed in this
   * transaction. It is a **report**, never a command: there is no field in
   * either body through which a caller could ask for `APPROVED`.
   */
  readonly requestStatus: string;
  readonly approvedAt: Date;
  /**
   * Whether this call re-served an earlier approval of the same version.
   *
   * A double submission and a retry after a dropped response both answer
   * `true`, with the identical snapshot id: approval is claimed once per version
   * and no second snapshot, acceptance row, transition, audit row or event is
   * ever appended.
   */
  readonly replayed: boolean;
}

/** The committed revision request. */
export interface DesignRevisionRequestedView {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  /**
   * The request's LC-11 state, which this decision did **not** change.
   *
   * Reported so the screen can say so plainly. `APP6-B11` §15 is explicit that a
   * revision request leaves the request in `DESIGN_REVIEW` with no transition
   * row and no self-edge, and publishing the unchanged state is how a client is
   * stopped from inferring a move that never happened.
   */
  readonly requestStatus: string;
  readonly decidedAt: Date;
  // No `nextVersionId` and no draft. `APP6-B08` owns revision authoring, and the
  // workshop has not authored anything at the instant this commits.
}
