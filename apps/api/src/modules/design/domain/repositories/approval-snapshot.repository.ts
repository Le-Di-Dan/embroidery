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
import type { DesignCaseId, DesignVersionId } from './design-case.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export type ApprovalSnapshotId = string & { readonly __brand: 'ApprovalSnapshotId' };

/**
 * The two placement branches a frozen approval may carry (CST-131,
 * `ADR-APP6-001` §3.2, `APP6-DB01`).
 *
 * A **union**, for the reason {@link DesignVersionPlacement} is one: CST-131
 * rejects a mixed row, a partial Catalog quartet and a branchless row alike, and
 * a single interface with five nullable fields would let this process build the
 * row the constraint exists to reject. The SQL constraint stays the arbiter; the
 * type makes the invalid shape unrepresentable on the way there.
 *
 * It is a **separate** union from `DesignVersionPlacement` rather than a reuse
 * of it, because the COP branches genuinely differ: a design version carries
 * `placementSideLabel`/`placementAreaLabel` of its own, while a snapshot freezes
 * those two into its branch-independent `sideName`/`areaName` display copies
 * (COL-TBL031-06) and adds no columns for them. Reusing the version's union
 * would put two label fields on this type that no snapshot column holds.
 */
export type ApprovalSnapshotPlacement = CatalogApprovalPlacement | CustomerOwnedApprovalPlacement;

export interface CatalogApprovalPlacement {
  readonly branch: 'CATALOG';
  /** The complete quartet. CST-131 rejects a partial one, so none is optional. */
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}

export interface CustomerOwnedApprovalPlacement {
  readonly branch: 'CUSTOMER_OWNED';
  readonly customerOwnedProductId: string;
  /** The version's frozen embroidery envelope, copied — never the item's own size. */
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}

export interface ApprovalSnapshot {
  readonly id: ApprovalSnapshotId;
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly customerId: string;
  /** Copied from the version at approval, and equal to it by construction. */
  readonly documentHash: string;
  readonly placement: ApprovalSnapshotPlacement;
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
  /**
   * Denormalised labels, frozen so a later product rename cannot rewrite
   * history.
   *
   * Branch-independent, and truthful on both. On the Catalog branch they are
   * read through the placement FKs at approval time; on the customer-owned
   * branch `productName` is `customer_owned_products.name` — the customer's own
   * words for their own garment — and `sideName`/`areaName` are the version's
   * frozen `placement_side_label`/`placement_area_label` (CST-130,
   * `ADR-APP6-001` §3.7). No Catalog identity is invented to fill them, and
   * `customer_owned_products.description` is never adopted as a placement label:
   * it describes the item, and using it would fabricate in text exactly what the
   * nullable FKs stop fabricating in identity.
   */
  readonly productName: string;
  /** Always absent on the customer-owned branch: a COP has no variant. */
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
