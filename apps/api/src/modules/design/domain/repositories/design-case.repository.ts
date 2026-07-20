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
  readonly status: DesignVersionState;
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  /** `sha256:<64 hex>`; required once sent, so GRD-007 can bind exactly. */
  readonly documentHash: string | undefined;
  readonly placement: DesignPlacement;
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

export interface CreateDesignVersionInput {
  readonly id: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  readonly placement: DesignPlacement;
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
  listVersions(caseId: DesignCaseId): Promise<DesignVersion[]>;
  /** The version currently awaiting a decision, if any. */
  findVersionInReview(caseId: DesignCaseId): Promise<DesignVersion | undefined>;
}
