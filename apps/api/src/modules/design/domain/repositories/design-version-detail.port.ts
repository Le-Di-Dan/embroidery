/**
 * The facts one exact Design Version's Admin detail read needs
 * (`APP6-A02` §5–§8).
 *
 * A **read-only port**, and a third AGG-10/AGG-11 contract beside
 * {@link DesignCaseRepository} and {@link ApprovalSnapshotRepository} rather
 * than a use of either. This is the rule `DesignReviewPort` records for the
 * customer surface, applied to the Admin one: what a module can inject is what
 * its route can eventually do. `DESIGN_CASE_REPOSITORY` carries `createVersion`,
 * `sendForReview`, `recordReview`, `setCurrentVersion` and `supersede`;
 * `APPROVAL_SNAPSHOT_REPOSITORY` carries `createFromVersion`. A GET that could
 * reach any of them is a GET that eventually does, and there is no write on this
 * port to reach.
 *
 * It is also what keeps `FU-APP6-B09-CASE-REPO-SIZE-01` closed. The 399-line
 * AGG-10 adapter is at the file-size limit and read projections are the
 * responsibility seam a split would use anyway, so A02's reads arrive here
 * rather than pushing that file over the line.
 *
 * ### Why the version lookup is case-bound
 *
 * {@link DesignVersionDetailPort.findVersion} takes the case **and** the
 * version, and there is deliberately no `findVersionById`. `APP6-A02` §6 makes
 * the resolution `requestId → current_design_case_id → case → versionId`, and a
 * global version lookup would let a caller read another request's design thread
 * by guessing an id — the ownership check would then be a line in a use case
 * rather than a property of the query. Bounding it here means a foreign version
 * matches no row and is indistinguishable from one that does not exist.
 *
 * ### Why review feedback is on this port and not on the history one
 *
 * `DesignVersionReview` (the B08 history projection) carries outcome and instant
 * only, on purpose: a list is not the place for the customer's words. `APP6-B11`
 * persists `REQUEST_REVISION` feedback on the decision record, and the Admin
 * surface that renders it is this one — so the feedback-bearing shape is here,
 * scoped to a single version, rather than widening the list contract.
 */
import type { DesignReviewOutcome } from '@embroidery/database';

import type {
  DesignCaseId,
  DesignVersionId,
  DesignVersionPlacement,
} from './design-case.repository';
import type { ApprovalSnapshotId } from './approval-snapshot.repository';

export const DESIGN_VERSION_DETAIL_PORT = Symbol('DESIGN_VERSION_DETAIL_PORT');

/**
 * One formal Design Version, as an Admin detail read is allowed to see it.
 *
 * The document and its stored hash are carried verbatim — unmigrated,
 * unrewritten and unrecanonicalized. `APP6-B09` computed and stored the hash at
 * send and `GRD-007` binds an approval to that exact value, so recomputing one
 * here would publish a number nothing in the record agrees with. A DRAFT has
 * none, and absent is the honest answer rather than a freshly computed digest.
 *
 * `previewHash`, `previewDerivativeId`, `supersededAt`, `voidedAt`,
 * `voidReason` and `createdAt` are deliberately absent, and the adapter's column
 * list omits them: the two preview columns are storage-derivative references,
 * and the rest are lifecycle bookkeeping no approved A02 frame renders.
 */
export interface DesignVersionDetail {
  readonly id: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly version: number;
  readonly parentVersionId: DesignVersionId | undefined;
  readonly status: string;
  /** The persisted Design Document, exactly as stored (v1 Catalog or v2 COP). */
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  /** `sha256:<64 hex>` — stored at send. Absent on an unsent DRAFT. */
  readonly documentHash: string | undefined;
  readonly placement: DesignVersionPlacement;
  readonly sentAt: Date | undefined;
  readonly approvedAt: Date | undefined;
}

/**
 * One customer decision on this version, with the words the customer wrote.
 *
 * `feedback` is the exact persisted `design_reviews.feedback` — never an audit
 * summary, never an outbox payload and never a rephrasing. `APP6-A02` §15 makes
 * that the whole point of this shape: an Admin operator acting on a revision
 * request is acting on what the customer actually said.
 *
 * `customer_id`, `grant_id` and `step_up_challenge_id` are absent, and the
 * adapter never selects them. They are credential references, and no approved
 * A02 frame renders one.
 */
export interface DesignVersionDetailReview {
  readonly outcome: DesignReviewOutcome;
  readonly decidedAt: Date;
  readonly feedback: string | undefined;
}

/**
 * The immutable evidence frozen when a customer approved this exact version.
 *
 * Every field is read from `approval_snapshots` itself, never from the current
 * customer, catalog or request rows. That is the difference between evidence and
 * a report: a product renamed after approval must not rewrite what was approved.
 *
 * `stepUpVerified` is the *presence* of the snapshot's committed step-up
 * evidence, reduced to a boolean here so the challenge id has no route out of
 * the adapter. `step_up_challenge_id` is `NOT NULL` on TBL-031, so a snapshot
 * that exists always carries it — the boolean is therefore structurally true
 * today, and it is computed rather than hard-coded so that a column later made
 * nullable changes this value instead of silently keeping it true.
 */
export interface ApprovalSnapshotEvidence {
  readonly id: ApprovalSnapshotId;
  readonly documentHash: string;
  readonly approvedAt: Date;
  /** Frozen at approval; `undefined` when the customer never gave one. */
  readonly contactName: string | undefined;
  /** Frozen normalized contacts. Masked before they leave the application layer. */
  readonly contactEmail: string | undefined;
  readonly contactPhone: string | undefined;
  readonly stepUpVerified: boolean;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
}

/**
 * One agreement version the customer accepted, as `GRD-008` captured it.
 *
 * Type, content hash and instant — the three facts the acceptance row itself
 * freezes. The human-readable **version integer is deliberately not here**, and
 * that is a truthfulness decision rather than an omission: it lives on
 * `agreement_versions`, which belongs to AGG-21, and the only port this
 * repository could reach it through (`AGREEMENT_REPOSITORY`) also carries
 * `addVersion`, `publishVersion`, `setCurrentVersion` and `withdrawVersion` —
 * the publication path, one injection away from a GET. The content hash is what
 * `GRD-008` actually binds acceptance to, so it identifies the accepted version
 * exactly, without reaching into another aggregate's mutable publication state
 * from a card whose whole premise is that it renders frozen evidence.
 */
export interface ApprovalAgreementEvidence {
  readonly agreementType: string;
  /** `sha256:<64 hex>` — the exact value `GRD-008` bound the acceptance to. */
  readonly contentHash: string;
  readonly acceptedAt: Date;
}

/**
 * One Design Case, as this Admin read is allowed to see it.
 *
 * Three fields. `customRequestId` is the back-pointer that proves ownership
 * rather than assuming it, and `currentVersionId` is `design_cases`' own
 * pointer — the sole authority for the `current` flag `APP6-B08` already
 * publishes, and the reason nothing downstream guesses "current" from the
 * highest version number.
 *
 * That pointer means *newest authored / current draft*. It is **not** the
 * version a customer is being asked to decide on, which the `SENT_FOR_REVIEW`
 * partial unique index arbitrates and which is routinely an older row. The two
 * are different facts and this port keeps them different: it offers no way to
 * read the review target at all.
 */
export interface DesignVersionDetailCase {
  readonly id: DesignCaseId;
  readonly customRequestId: string;
  readonly currentVersionId: DesignVersionId | undefined;
}

export interface DesignVersionDetailPort {
  /**
   * The case, or nothing when the id names no row. Never locked: this is a read.
   *
   * Read through this port rather than through `DESIGN_CASE_REPOSITORY.findById`
   * — which answers the same question — because that repository also carries
   * `createVersion`, `sendForReview`, `recordReview`, `setCurrentVersion` and
   * `supersede`, and constructing it additionally requires
   * `PLACEMENT_HIERARCHY_PORT` and therefore `CatalogModule`. A GET composed
   * around it would hold every one of those in the same injector, for one
   * SELECT of three columns.
   */
  findCase(id: DesignCaseId): Promise<DesignVersionDetailCase | undefined>;

  /**
   * The exact version of the exact case, or nothing.
   *
   * Both ids are required and both are matched. A version id that names a row on
   * another case answers `undefined`, identically to one that names no row at
   * all — which is what makes a foreign version indistinguishable from a missing
   * one at the HTTP edge, rather than a 403 that confirms it exists.
   *
   * Never locked: this is a read, and `FOR UPDATE` on an Admin GET would
   * serialise the screen against every concurrent send for a guarantee a detail
   * view does not need.
   */
  findVersion(
    caseId: DesignCaseId,
    versionId: DesignVersionId,
  ): Promise<DesignVersionDetail | undefined>;

  /** This version's decisions, oldest first. Empty until a customer decides. */
  listReviews(versionId: DesignVersionId): Promise<DesignVersionDetailReview[]>;

  /** The frozen approval for this exact version, or nothing if never approved. */
  findApproval(versionId: DesignVersionId): Promise<ApprovalSnapshotEvidence | undefined>;

  /** The agreement versions that approval captured (`GRD-008`), in stored order. */
  listAgreements(snapshotId: ApprovalSnapshotId): Promise<ApprovalAgreementEvidence[]>;
}
