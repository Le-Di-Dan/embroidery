/**
 * AGG-17 Production Job persistence contract (TBL-059..TBL-063).
 *
 * A job exists against **exactly one approval snapshot** (INV-03/06) and
 * freezes its specification at creation. That specification is what the
 * machine file is cut from, so it must be a copy of what the customer
 * approved — not a live read that could drift.
 *
 * Carries **G-DB7-07** (the specification belongs to the job's own approval
 * chain) and **G-DB7-25** (lifecycle legality).
 */
import type { ProductionArtifactKind, ProductionJobState } from '@embroidery/database';

export type ProductionJobId = string & { readonly __brand: 'ProductionJobId' };

export interface ProductionJob {
  readonly id: ProductionJobId;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;
}

export interface ProductionSpecification {
  readonly productionJobId: ProductionJobId;
  readonly approvalSnapshotId: string;
  /** Copied from the approval — the machine file's provenance. */
  readonly documentHash: string;
  readonly productName: string;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
}

/** Who moved the job. Admin or an automated step, never a customer. */
export type ProductionActor =
  | { readonly kind: 'ADMIN'; readonly adminId: string }
  | { readonly kind: 'SYSTEM'; readonly systemJobKey: string };

export const PRODUCTION_JOB_REPOSITORY = Symbol('PRODUCTION_JOB_REPOSITORY');

export interface ProductionJobRepository {
  /**
   * Creates the job and freezes its specification from the approval, together.
   *
   * The specification is copied from the approval snapshot the job names, so
   * it cannot describe artwork the customer did not approve (G-DB7-07).
   *
   * @requiresTransaction
   */
  createJob(input: {
    id: ProductionJobId;
    orderId: string;
    approvalSnapshotId: string;
    productionParameters?: string | undefined;
  }): Promise<ProductionJob>;

  /**
   * Loads the job under its row lock, before any decision is taken about it
   * (`APP8-B04` §8).
   *
   * The same row lock {@link transition} takes, reachable on its own because a
   * transition command must **decide** from the job's committed state and not
   * only move it: `GRD-015` compares the job's `approval_snapshot_id` against the
   * order's authoritative one, and consumes inventory, before the move happens.
   * Reading that through {@link findById} and acting on it afterwards would put
   * the whole start decision outside the lock that arbitrates it.
   *
   * @requiresTransaction
   */
  loadForUpdate(id: ProductionJobId): Promise<ProductionJob | undefined>;

  /** @requiresTransaction — move and evidence together, legality checked. */
  transition(input: {
    id: ProductionJobId;
    to: ProductionJobState;
    actor: ProductionActor;
    reason?: string | undefined;
    correlationId: string;
  }): Promise<ProductionJob>;

  /** @requiresTransaction — internal, unwatermarked files (INV-21/22). */
  attachArtifact(
    id: ProductionJobId,
    assetId: string,
    kind: ProductionArtifactKind,
    note?: string,
  ): Promise<void>;

  /** @requiresTransaction */
  appendNote(id: ProductionJobId, note: string, adminId: string): Promise<void>;

  findById(id: ProductionJobId): Promise<ProductionJob | undefined>;
  findByOrderAndApproval(
    orderId: string,
    approvalSnapshotId: string,
  ): Promise<ProductionJob | undefined>;
  loadSpecification(id: ProductionJobId): Promise<ProductionSpecification | undefined>;
  listArtifactAssetIds(id: ProductionJobId): Promise<string[]>;
}
