/**
 * AGG-10 Design Case persistence contract (TBL-027..TBL-030).
 *
 * The design thread of one request: versions, the current-version pointer, and
 * customer review decisions.
 *
 * Carries **G-DB7-02** (a current version must belong to its case),
 * **G-DB7-09** (the case↔request pointers must agree) and **G-DB7-15** (one
 * active review at a time, arbitrated physically and mapped here).
 *
 * A version is immutable once sent — enforced by an S24 trigger, so no method
 * here offers to edit one.
 */
import type { DesignReviewOutcome, DesignVersionState } from '@embroidery/database';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export type DesignCaseId = string & { readonly __brand: 'DesignCaseId' };
export type DesignVersionId = string & { readonly __brand: 'DesignVersionId' };

export interface DesignCase {
  readonly id: DesignCaseId;
  readonly customRequestId: string;
  readonly currentVersionId: DesignVersionId | undefined;
}

export interface DesignVersion {
  readonly id: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly version: number;
  /**
   * The version this one continues, or `undefined` at the root of the chain
   * (REL-046, REQ-DVER-005).
   *
   * Nullable in the schema and optional here for the same reason: the first
   * version of a case has no predecessor, and inventing one to fill a nullable
   * relation would put a lineage in the record that never happened.
   */
  readonly parentVersionId: DesignVersionId | undefined;
  readonly status: DesignVersionState;
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  /** `sha256:<64 hex>`; required once sent, so GRD-007 can bind exactly. */
  readonly documentHash: string | undefined;
  readonly placement: DesignVersionPlacement;
  readonly sentAt: Date | undefined;
  readonly approvedAt: Date | undefined;
}

/** The exact geometry a version was authored against — frozen into the approval. */
export interface DesignPlacement {
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}

/**
 * The two placement branches a formal Design Version may carry
 * (`ADR-APP6-001` §3.2, CST-129, `APP6-B08`).
 *
 * A **union**, not one interface with five nullable fields, so CST-129 is a fact
 * the type system enforces rather than a rule the adapter has to remember: there
 * is no value of this type that names a Catalog product *and* a customer-owned
 * one, and none that carries half a Catalog quartet. The SQL constraint stays
 * the arbiter — but nothing in this process can now build the row it would
 * reject.
 *
 * `branch` is a **domain discriminator, never a persisted column and never a
 * client input**. Which branch a version is on is derived server-side from the
 * request (a request with a `customer_owned_products` row is a COP request,
 * CST-027); this tag is how that derivation travels from the resolver to the
 * adapter without being re-derived, and re-deriving it from null-checks at each
 * call site is exactly the drift it exists to prevent.
 *
 * The two physical dimensions are on both branches but do not mean quite the
 * same thing, which is why they are documented per branch rather than hoisted.
 */
export type DesignVersionPlacement = CatalogVersionPlacement | CustomerOwnedVersionPlacement;

export interface CatalogVersionPlacement {
  readonly branch: 'CATALOG';
  /**
   * The **complete** Catalog quartet. All four are required together: a partial
   * quartet is not a stricter record, it is an unanswerable one, and no part of
   * it is ever fabricated or substituted to make persistence accept the row.
   */
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  /** The Product Side's own frozen dimensions, as Catalog states them. */
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}

export interface CustomerOwnedVersionPlacement {
  readonly branch: 'CUSTOMER_OWNED';
  readonly customerOwnedProductId: string;
  /**
   * The agreed placement, in words (CST-130, ADR-APP6-001 §3.7).
   *
   * Required and nonblank because `approval_snapshots.side_name`/`area_name`
   * and `production_specifications` downstream are NOT NULL and the COP branch
   * has no FK to read them through. They are the *placement*, never the item:
   * `customer_owned_products.name`/`description` describe the garment.
   */
  readonly sideLabel: string;
  readonly areaLabel: string;
  /**
   * The version's authoritative frozen embroidery **placement envelope**
   * (ADR-APP6-001 §3.3) — the area to be stitched, positive on both axes.
   *
   * Never copied from `customer_owned_products.physical_width_mm`/
   * `physical_height_mm`: those are nullable and describe the item, and adopting
   * them as bounds would silently claim a customer's whole jacket as the stitch
   * area. A COP version may consult them as evidence; it may never adopt them.
   */
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}

/**
 * One customer decision on one version, as the Admin history projection reads it
 * (`APP6-B08` §16/§17).
 *
 * Outcome and instant only. No `feedback`, no `customer_id`, no `grant_id` and
 * no `step_up_challenge_id`: the version list is a history projection, and a
 * secure-grant id in a list response is a credential reference nobody on that
 * screen needs. `APP6-B10`/`B11` own the decision surfaces that do.
 */
export interface DesignVersionReview {
  readonly designVersionId: DesignVersionId;
  readonly outcome: DesignReviewOutcome;
  readonly decidedAt: Date;
}

export interface CreateDesignVersionInput {
  readonly id: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  readonly placement: DesignVersionPlacement;
  readonly parentVersionId?: DesignVersionId | undefined;
}

export interface RecordReviewInput {
  readonly designVersionId: DesignVersionId;
  readonly outcome: DesignReviewOutcome;
  readonly feedback?: string | undefined;
  readonly customerId: string;
  /** The secure grant that authorised the decision (GRD-002). */
  readonly grantId: string;
  readonly stepUpChallengeId?: string | undefined;
  readonly decidedAt: Date;
}

export const DESIGN_CASE_REPOSITORY = Symbol('DESIGN_CASE_REPOSITORY');

export interface DesignCaseRepository {
  /**
   * Creates the case and points the request at it, both directions (G-DB7-09).
   *
   * @requiresTransaction
   */
  createForRequest(id: DesignCaseId, customRequestId: string): Promise<DesignCase>;

  /**
   * Adds a DRAFT version, validating its placement chain first (G-DB7-13).
   *
   * The chain check is **Catalog-only**, and that is the ADR-APP6-001 §3.3 rule
   * rather than an omission: a customer-owned product has no Catalog placement
   * authority to reconcile against, and running the hierarchy assertion for it
   * would require fabricating the very ids the ADR exists to prevent.
   *
   * @requiresTransaction
   */
  createVersion(input: CreateDesignVersionInput): Promise<DesignVersion>;

  /**
   * Sends a draft for review and hashes its document.
   *
   * Only one version per case may be in review — the partial unique index is
   * the arbiter (G-DB7-15/GRD-004).
   *
   * @requiresTransaction
   */
  sendForReview(id: DesignVersionId, documentHash: string, at: Date): Promise<DesignVersion>;

  /** Points the case at one of its **own** versions (G-DB7-02). @requiresTransaction */
  setCurrentVersion(caseId: DesignCaseId, versionId: DesignVersionId): Promise<void>;

  /**
   * Appends a customer decision and moves the version accordingly.
   *
   * First decision wins: a version already decided cannot be decided again,
   * or a customer could approve after requesting a revision.
   *
   * @requiresTransaction
   */
  recordReview(input: RecordReviewInput): Promise<DesignVersion>;

  /** @requiresTransaction */
  supersede(id: DesignVersionId, at: Date): Promise<void>;

  findByRequest(customRequestId: string): Promise<DesignCase | undefined>;
  findById(id: DesignCaseId): Promise<DesignCase | undefined>;
  loadVersion(id: DesignVersionId): Promise<DesignVersion | undefined>;
  /**
   * The same version under a row lock (`APP6-B09`).
   *
   * Separate from {@link loadVersion} rather than a boolean on it, the rule
   * `CustomRequestDesignContextPort` already follows: a read that *could* be
   * asked to lock is a read that eventually does, and the version list has no
   * business serialising against every concurrent send.
   *
   * The lock is what makes a duplicate send of the **same** version replay
   * rather than fail. Without it two senders both read `DRAFT`, both reach the
   * conditional `UPDATE`, and the loser's statement matches no row — a bare
   * "not a draft" refusal for what is simply the same command issued twice.
   * Holding the row makes the second sender re-read `SENT_FOR_REVIEW` and take
   * the replay branch, which is what LC-08's *"resend replays"* means.
   *
   * `@requiresTransaction` — a lock taken outside one is released immediately
   * and proves nothing.
   */
  lockVersion(id: DesignVersionId): Promise<DesignVersion | undefined>;

  /**
   * The case's versions that `TR-LC08-05` supersedes when a new one is sent.
   *
   * `REVISION_REQUESTED` only, and the omission of `SENT_FOR_REVIEW` is the
   * point. LC-08 names both as sources, but the second is unreachable from a
   * send: GRD-004 refuses the send outright while another version of the case is
   * still in review, so a `SENT_FOR_REVIEW` sibling ends the transaction before
   * any supersession is considered. Returning it here would be an invitation to
   * clear an active review to make a new send fit — exactly what GRD-004 exists
   * to prevent.
   *
   * Ids only: the caller marks rows, and loading whole documents to do it would
   * pull the entire design thread's artwork through a transaction that needs
   * none of it.
   */
  listRevisionRequestedVersionIds(caseId: DesignCaseId): Promise<DesignVersionId[]>;

  listVersions(caseId: DesignCaseId): Promise<DesignVersion[]>;
  /**
   * Every recorded decision across this case's versions, oldest first.
   *
   * One read for the whole case rather than one per version: the Admin history
   * screen wants the case, and a per-version call in a loop is the same rows
   * fetched N times. Ordering is `decided_at` then `id`, because `design_reviews`
   * declares no sequence column and a bare timestamp sort is not deterministic
   * when two decisions share an instant.
   */
  listReviews(caseId: DesignCaseId): Promise<DesignVersionReview[]>;
  /** The version currently awaiting a decision, if any. */
  findVersionInReview(caseId: DesignCaseId): Promise<DesignVersion | undefined>;
}
