/**
 * The facts the customer's secure design review read needs (`APP6-B10` §6, §8).
 *
 * A **read-only port**, and a second AGG-10 contract beside
 * {@link DesignCaseRepository} rather than a use of it. That repository carries
 * `createVersion`, `sendForReview`, `recordReview`, `setCurrentVersion` and
 * `supersede`; a module composed for an unauthenticated caller that imported
 * `DesignModule` to reach it would hold every one of them — plus
 * `DESIGN_SESSION_REPOSITORY`, `APPROVAL_SNAPSHOT_REPOSITORY` and the Session
 * guard's whole dependency closure — in the same injector. `APP6-B04` records
 * the rule this follows: what a module can inject is what its route can
 * eventually do, and there is no write on this port to reach.
 *
 * It is also what keeps `FU-APP6-B09-CASE-REPO-SIZE-01` closed. The 399-line
 * AGG-10 adapter is at the file-size limit, and read projections are the
 * responsibility seam a split would use anyway; B10 adds its two reads here
 * instead of pushing that file over the line.
 *
 * ### The review target is not the current-version pointer
 *
 * `design_cases.current_version_id` means *newest authored / current draft*
 * (`APP6-B09`). The version a customer is being asked to decide on is the one
 * the `SENT_FOR_REVIEW` partial unique index arbitrates (G-DB7-15 / GRD-004),
 * and those are routinely different rows: a workshop that has already started
 * the next draft has advanced the pointer while the customer's review is still
 * open. Reading the pointer would show that customer an unsent draft. So this
 * port offers no way to read it — {@link DesignReviewPort.findReviewCase}
 * projects the case's identity and its request back-pointer and stops there.
 */
import type { DesignCaseId, DesignVersionId } from './design-case.repository';

export const DESIGN_REVIEW_PORT = Symbol('DESIGN_REVIEW_PORT');

/**
 * One Design Case, as a grant-scoped read is allowed to see it.
 *
 * Two ids. `current_version_id` is deliberately absent — see the header — and so
 * are the case's timestamps: nothing on the customer surface reads them, and the
 * SELECT that never retrieves a column is redaction no projection can forget.
 */
export interface DesignReviewCase {
  readonly id: DesignCaseId;
  /** The request this case names back, so ownership is proved, not assumed. */
  readonly customRequestId: string;
}

/**
 * The exact version awaiting a customer decision, and only the parts of it a
 * customer may see.
 *
 * No placement, no `parentVersionId`, no `approvedAt`, and no `status` beyond
 * the fact that the row qualified: the port answers a question whose only
 * possible answer is `SENT_FOR_REVIEW`, so returning a status field would invite
 * a caller to branch on a value that can never vary. The document and its stored
 * hash are carried verbatim — B10 returns the hash `APP6-B09` computed and
 * stored and recomputes nothing for response semantics, because that stored
 * value is exactly what `GRD-007` will bind the approval to.
 */
export interface DesignReviewVersion {
  readonly id: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly version: number;
  readonly documentSchemaVersion: number;
  /** The persisted Design Document, unmigrated and unrewritten (v1 or v2). */
  readonly designDocument: unknown;
  /** `sha256:<64 hex>` — stored at send. Absent is a refusal, never a recompute. */
  readonly documentHash: string | undefined;
  readonly sentAt: Date | undefined;
}

export interface DesignReviewPort {
  /** The case, or nothing when the id names no row. Never locked: this is a read. */
  findReviewCase(id: DesignCaseId): Promise<DesignReviewCase | undefined>;

  /**
   * The one version of this case in `SENT_FOR_REVIEW`, or nothing.
   *
   * At most one row can qualify — `uq_design_versions__case__sent_for_review` is
   * the arbiter, the same index `APP6-B09` sends against — so this is a lookup,
   * not a choice. It takes no ordering, no limit hint and no caller-supplied
   * version id, so "latest", "max(version)" and "the newest DRAFT" are not
   * selectors this port could be asked for.
   */
  findVersionInReview(caseId: DesignCaseId): Promise<DesignReviewVersion | undefined>;
}
