/**
 * The bounded Admin view of one exact Design Version (`APP6-A02` §7).
 *
 * Written field by field rather than spread, the rule `APP5-B04`, `APP6-B07` and
 * `APP6-B08` all follow: the port types have nowhere to put a property they gain
 * later, so a column added upstream cannot reach an HTTP response by accident.
 *
 * ## What this adds to the B08 history view, and why
 *
 * Three facts, each of which `APP6-B08` deliberately left out of a *list* and
 * each of which an approved A02 frame renders:
 *
 * - the **document**, because `695:3` creates a new DRAFT from an exact
 *   predecessor and, after a reload, the browser has no other way to obtain it;
 * - the review **feedback**, because `696:113` renders the customer's own words;
 * - the **approval snapshot**, because `697:3` renders immutable approval
 *   evidence and `APP6-A02` §4.3 forbids synthesizing it from current rows.
 *
 * ## The approval projection reads frozen truth only
 *
 * Every field on {@link ApprovalEvidenceView} comes from `approval_snapshots`
 * and its acceptance children. Nothing is re-resolved from the customer, the
 * catalog, the request or the current design case — a product renamed after
 * approval must not rewrite what was approved, and a contact the customer later
 * changed must still show how they were reachable at the moment they approved.
 *
 * ## Contacts are masked here, once
 *
 * The snapshot freezes **normalized** contact values, which is what
 * `maskContact` takes. Masking at this seam — rather than in the controller or
 * the adapter — means the unmasked value exists only inside this function's
 * arguments and never reaches a response type: `ApprovalEvidenceView` has no
 * field that could hold one.
 */
import { maskContact } from '../../customer/domain/contact/mask-contact';
import type {
  ApprovalAgreementEvidence,
  ApprovalSnapshotEvidence,
  DesignVersionDetail,
  DesignVersionDetailReview,
} from '../domain/repositories/design-version-detail.port';

export interface DesignVersionDetailReviewView {
  readonly outcome: string;
  readonly decidedAt: Date;
  /** The customer's exact persisted words, or their exact absence. */
  readonly feedback: string | undefined;
}

export interface ApprovalAgreementView {
  readonly agreementType: string;
  readonly contentHash: string;
  readonly acceptedAt: Date;
}

export interface ApprovalEvidenceView {
  readonly documentHash: string;
  readonly approvedAt: Date;
  /** Frozen display name, absent when the customer never gave one. */
  readonly customerDisplayName: string | undefined;
  /** Masked forms of the frozen contacts. The unmasked values never leave. */
  readonly maskedEmail: string | undefined;
  readonly maskedPhone: string | undefined;
  /** Whether the approval committed step-up evidence. Never the challenge id. */
  readonly reverified: boolean;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly agreements: readonly ApprovalAgreementView[];
}

export interface DesignVersionDetailView {
  readonly versionId: string;
  readonly designCaseId: string;
  readonly version: number;
  readonly status: string;
  readonly parentVersionId: string | undefined;
  readonly documentSchemaVersion: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly productId: string | undefined;
  readonly productVariantId: string | undefined;
  readonly productSideId: string | undefined;
  readonly embroideryAreaId: string | undefined;
  readonly placementSideLabel: string | undefined;
  readonly placementAreaLabel: string | undefined;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  /** True only when the design case's own pointer names this version. */
  readonly current: boolean;
  readonly sentAt: Date | undefined;
  readonly approvedAt: Date | undefined;
  /** Stored at send, absent on an unsent DRAFT. Never recomputed. */
  readonly documentHash: string | undefined;
  /** The persisted Design Document, exactly as stored. */
  readonly document: unknown;
  readonly reviews: readonly DesignVersionDetailReviewView[];
  readonly approval: ApprovalEvidenceView | undefined;
}

export interface ProjectDetailInput {
  readonly version: DesignVersionDetail;
  readonly currentVersionId: string | undefined;
  readonly reviews: readonly DesignVersionDetailReview[];
  readonly approval: ApprovalSnapshotEvidence | undefined;
  readonly agreements: readonly ApprovalAgreementEvidence[];
}

export function projectVersionDetail(input: ProjectDetailInput): DesignVersionDetailView {
  const { version } = input;
  const placement = version.placement;
  const catalog = placement.branch === 'CATALOG';

  return {
    versionId: version.id,
    designCaseId: version.designCaseId,
    version: version.version,
    status: version.status,
    parentVersionId: version.parentVersionId,
    documentSchemaVersion: version.documentSchemaVersion,
    branch: placement.branch,
    // Each branch reports its own facts and `undefined` for the other's, exactly
    // as the B08 list projection does. A COP version returning a Catalog id, or
    // a Catalog version returning a label, would be the mixed row CST-129 exists
    // to make unstorable — reintroduced at the read edge, where nothing catches
    // it.
    productId: catalog ? placement.productId : undefined,
    productVariantId: catalog ? placement.productVariantId : undefined,
    productSideId: catalog ? placement.productSideId : undefined,
    embroideryAreaId: catalog ? placement.embroideryAreaId : undefined,
    placementSideLabel: catalog ? undefined : placement.sideLabel,
    placementAreaLabel: catalog ? undefined : placement.areaLabel,
    physicalWidthMm: placement.physicalWidthMm,
    physicalHeightMm: placement.physicalHeightMm,
    // Read from `design_cases.current_version_id`, never guessed from "the
    // highest version number" — and never conflated with the version a customer
    // is currently reviewing, which is a different row whenever the workshop has
    // started the next draft.
    current: input.currentVersionId !== undefined && input.currentVersionId === version.id,
    sentAt: version.sentAt,
    approvedAt: version.approvedAt,
    documentHash: version.documentHash,
    document: version.designDocument,
    reviews: input.reviews.map((review) => ({
      outcome: review.outcome,
      decidedAt: review.decidedAt,
      feedback: review.feedback,
    })),
    approval:
      input.approval === undefined ? undefined : projectApproval(input.approval, input.agreements),
  };
}

function projectApproval(
  snapshot: ApprovalSnapshotEvidence,
  agreements: readonly ApprovalAgreementEvidence[],
): ApprovalEvidenceView {
  return {
    documentHash: snapshot.documentHash,
    approvedAt: snapshot.approvedAt,
    customerDisplayName: snapshot.contactName,
    maskedEmail:
      snapshot.contactEmail === undefined ? undefined : maskContact('EMAIL', snapshot.contactEmail),
    maskedPhone:
      snapshot.contactPhone === undefined ? undefined : maskContact('PHONE', snapshot.contactPhone),
    reverified: snapshot.stepUpVerified,
    productName: snapshot.productName,
    // Absent on the customer-owned branch because a COP has no variant — not
    // because one could not be found. The snapshot column is nullable for
    // exactly that row.
    variantLabel: snapshot.variantLabel,
    sideName: snapshot.sideName,
    areaName: snapshot.areaName,
    // The snapshot's own frozen dimensions. On the COP branch these are the
    // version's embroidery placement envelope copied at approval, never the
    // customer item's own size.
    physicalWidthMm: snapshot.physicalWidthMm,
    physicalHeightMm: snapshot.physicalHeightMm,
    quantityTotal: snapshot.quantityTotal,
    branch: snapshot.branch,
    agreements: agreements.map((agreement) => ({
      agreementType: agreement.agreementType,
      contentHash: agreement.contentHash,
      acceptedAt: agreement.acceptedAt,
    })),
  };
}
