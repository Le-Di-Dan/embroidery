/**
 * AGG-11 Approval Snapshot persistence contract (TBL-031..TBL-033).
 *
 * The immutable evidence that a customer approved one exact design version.
 * Everything downstream — the order, the production job, the machine file —
 * is authorised by this row, so its guards are the tightest in the system:
 *
 * - **G-DB7-14** (GRD-007): the snapshot binds the exact version **and** its
 *   document hash. A hash mismatch means the artwork changed after the
 *   customer saw it.
 * - **G-DB7-16** (GRD-008): the required agreements must each have a published,
 *   in-force version, captured with its content hash.
 * - **G-DB7-13**: the frozen placement must be a coherent chain.
 *
 * There is no update method and no delete method. An S24 trigger rejects both;
 * offering either would be a lie about what the model permits.
 */
import type { DesignCaseId, DesignPlacement, DesignVersionId } from './design-case.repository';

export type ApprovalSnapshotId = string & { readonly __brand: 'ApprovalSnapshotId' };

export interface ApprovalSnapshot {
  readonly id: ApprovalSnapshotId;
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly customerId: string;
  /** Copied from the version at approval, and equal to it by construction. */
  readonly documentHash: string;
  readonly placement: DesignPlacement;
  readonly productName: string;
  readonly sideName: string;
  readonly areaName: string;
  readonly quantityTotal: number;
  readonly approvedAt: Date;
}

export interface ThreadColorInput {
  readonly position: number;
  readonly colorCode: string;
  readonly colorName?: string | undefined;
}

export interface AgreementAcceptanceInput {
  readonly agreementVersionId: string;
  readonly agreementType: string;
  readonly contentHash: string;
}

export interface CreateApprovalSnapshotInput {
  readonly id: ApprovalSnapshotId;
  readonly designVersionId: DesignVersionId;
  /** Must equal the version's stored hash, or the artwork changed (G-DB7-14). */
  readonly submittedDocumentHash: string;
  readonly customerId: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
  /** Denormalised labels, frozen so a later product rename cannot rewrite history. */
  readonly productName: string;
  readonly variantLabel?: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  /** Frozen from the request's quantity breakdown at approval. */
  readonly quantityTotal: number;
  /**
   * Contact details as they stood at approval.
   *
   * Denormalised on purpose: the customer's contact point can later be changed
   * or anonymized, and this evidence must still show who approved and how they
   * were reachable at the time.
   */
  readonly contactName?: string | undefined;
  readonly contactEmail?: string | undefined;
  readonly contactPhone?: string | undefined;
  readonly threadColors: readonly ThreadColorInput[];
  /** The effective agreement set the customer accepted (G-DB7-16). */
  readonly agreementAcceptances: readonly AgreementAcceptanceInput[];
  readonly approvedAt: Date;
}

export const APPROVAL_SNAPSHOT_REPOSITORY = Symbol('APPROVAL_SNAPSHOT_REPOSITORY');

export interface ApprovalSnapshotRepository {
  /**
   * Freezes the approval, with its thread colours and agreement acceptances.
   *
   * @requiresTransaction — the snapshot and its children are one indivisible
   * piece of evidence; a snapshot missing its acceptances would claim an
   * approval that never captured the terms.
   */
  createFromVersion(input: CreateApprovalSnapshotInput): Promise<ApprovalSnapshot>;

  findByDesignVersion(designVersionId: DesignVersionId): Promise<ApprovalSnapshot | undefined>;
  findById(id: ApprovalSnapshotId): Promise<ApprovalSnapshot | undefined>;
  listThreadColors(id: ApprovalSnapshotId): Promise<ThreadColorInput[]>;
  listAgreementAcceptances(id: ApprovalSnapshotId): Promise<AgreementAcceptanceInput[]>;
}
