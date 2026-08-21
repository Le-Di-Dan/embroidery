/**
 * Drizzle implementation of the exact-version Admin detail port (`APP6-A02` §6).
 *
 * Columns are named explicitly, never `select()`, for the reason
 * `DrizzleDesignReviewAdapter` records: TBL-028 also carries `preview_hash`,
 * `preview_derivative_id`, `superseded_at`, `voided_at`, `void_reason` and
 * `created_at`, and an unprojected select would hand every one of them to a
 * projection that has no rule reading them — and would keep doing so for
 * whatever the table grows next. The two preview columns matter most: they are
 * storage-derivative references, and this surface publishes no derivative.
 *
 * `design_reviews` is projected to three columns for the same reason and one
 * more: `customer_id`, `grant_id` and `step_up_challenge_id` are credential
 * references, and a column never retrieved is redaction no later projection can
 * forget.
 *
 * Nothing here locks and nothing here writes. There is no `UPDATE`, no
 * `INSERT`, no `FOR UPDATE` and no transaction: `FOR UPDATE` on an Admin GET
 * would serialise the workbench against every concurrent send for a guarantee a
 * detail view does not need, and `GRD-007` re-reads the version under a lock
 * when an approval is actually submitted.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { DesignReviewOutcome } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq } from 'drizzle-orm';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { ApprovalSnapshotId } from '../../domain/repositories/approval-snapshot.repository';
import type {
  DesignCaseId,
  DesignVersionId,
  DesignVersionPlacement,
} from '../../domain/repositories/design-case.repository';
import type {
  ApprovalAgreementEvidence,
  ApprovalSnapshotEvidence,
  DesignVersionDetail,
  DesignVersionDetailCase,
  DesignVersionDetailPort,
  DesignVersionDetailReview,
} from '../../domain/repositories/design-version-detail.port';

const {
  approvalSnapshotAgreementAcceptances,
  approvalSnapshots,
  designCases,
  designReviews,
  designVersions,
} = schema;

const CASE_COLUMNS = {
  id: designCases.id,
  customRequestId: designCases.customRequestId,
  currentVersionId: designCases.currentVersionId,
} as const;

const VERSION_COLUMNS = {
  id: designVersions.id,
  designCaseId: designVersions.designCaseId,
  version: designVersions.version,
  parentVersionId: designVersions.parentVersionId,
  status: designVersions.status,
  designDocument: designVersions.designDocument,
  documentSchemaVersion: designVersions.documentSchemaVersion,
  documentHash: designVersions.documentHash,
  productId: designVersions.productId,
  productVariantId: designVersions.productVariantId,
  productSideId: designVersions.productSideId,
  embroideryAreaId: designVersions.embroideryAreaId,
  customerOwnedProductId: designVersions.customerOwnedProductId,
  placementSideLabel: designVersions.placementSideLabel,
  placementAreaLabel: designVersions.placementAreaLabel,
  physicalWidthMm: designVersions.physicalWidthMm,
  physicalHeightMm: designVersions.physicalHeightMm,
  sentAt: designVersions.sentAt,
  approvedAt: designVersions.approvedAt,
} as const;

const REVIEW_COLUMNS = {
  outcome: designReviews.outcome,
  decidedAt: designReviews.decidedAt,
  feedback: designReviews.feedback,
} as const;

const SNAPSHOT_COLUMNS = {
  id: approvalSnapshots.id,
  documentHash: approvalSnapshots.documentHash,
  approvedAt: approvalSnapshots.approvedAt,
  contactName: approvalSnapshots.contactName,
  contactEmail: approvalSnapshots.contactEmail,
  contactPhone: approvalSnapshots.contactPhone,
  stepUpChallengeId: approvalSnapshots.stepUpChallengeId,
  productName: approvalSnapshots.productName,
  variantLabel: approvalSnapshots.variantLabel,
  sideName: approvalSnapshots.sideName,
  areaName: approvalSnapshots.areaName,
  physicalWidthMm: approvalSnapshots.physicalWidthMm,
  physicalHeightMm: approvalSnapshots.physicalHeightMm,
  quantityTotal: approvalSnapshots.quantityTotal,
  customerOwnedProductId: approvalSnapshots.customerOwnedProductId,
} as const;

const AGREEMENT_COLUMNS = {
  agreementType: approvalSnapshotAgreementAcceptances.agreementType,
  contentHash: approvalSnapshotAgreementAcceptances.contentHash,
  acceptedAt: approvalSnapshotAgreementAcceptances.acceptedAt,
} as const;

/**
 * Reads the row's placement back as whichever branch it actually carries
 * (CST-129, `ADR-APP6-001` §3.2).
 *
 * The COP column is the discriminator and is read **first**, exactly as
 * `design-row.mapper.ts` does and for the same reason: it is the one column
 * CST-129 guarantees is decisive, and branching on `product_id` would give the
 * same answer today and a silently wrong one the first time a column is added.
 *
 * Written here rather than reusing the shared mapper because that mapper takes a
 * whole `VersionRow` — every column of TBL-028 — and this adapter deliberately
 * retrieves fewer. Widening the shared function's parameter to fit would change
 * source owned by `APP6-B08`/`B09`, which is source this checkpoint has no
 * reason to touch.
 */
function toPlacement(row: {
  readonly customerOwnedProductId: string | null;
  readonly productId: string | null;
  readonly productVariantId: string | null;
  readonly productSideId: string | null;
  readonly embroideryAreaId: string | null;
  readonly placementSideLabel: string | null;
  readonly placementAreaLabel: string | null;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
}): DesignVersionPlacement {
  if (row.customerOwnedProductId !== null) {
    return {
      branch: 'CUSTOMER_OWNED',
      customerOwnedProductId: row.customerOwnedProductId,
      sideLabel: row.placementSideLabel as string,
      areaLabel: row.placementAreaLabel as string,
      physicalWidthMm: row.physicalWidthMm,
      physicalHeightMm: row.physicalHeightMm,
    };
  }
  return {
    branch: 'CATALOG',
    productId: row.productId as ProductId,
    productVariantId: row.productVariantId as ProductVariantId,
    productSideId: row.productSideId as ProductSideId,
    embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
    physicalWidthMm: row.physicalWidthMm,
    physicalHeightMm: row.physicalHeightMm,
  };
}

@Injectable()
export class DrizzleDesignVersionDetailAdapter
  extends DrizzleRepository
  implements DesignVersionDetailPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findCase(id: DesignCaseId): Promise<DesignVersionDetailCase | undefined> {
    return this.run('findCase', async () => {
      const [row] = await this.db
        .select(CASE_COLUMNS)
        .from(designCases)
        .where(eq(designCases.id, id))
        .limit(1);

      return row === undefined
        ? undefined
        : {
            id: row.id as DesignCaseId,
            customRequestId: row.customRequestId,
            currentVersionId: (row.currentVersionId ?? undefined) as DesignVersionId | undefined,
          };
    });
  }

  async findVersion(
    caseId: DesignCaseId,
    versionId: DesignVersionId,
  ): Promise<DesignVersionDetail | undefined> {
    return this.run('findVersion', async () => {
      const [row] = await this.db
        .select(VERSION_COLUMNS)
        .from(designVersions)
        .where(
          // Both predicates, always. The case id is not a filter added for
          // tidiness: it is the ownership check, and a version belonging to
          // another request's design thread matches no row here rather than
          // being fetched and then refused somewhere a later edit could skip.
          and(eq(designVersions.designCaseId, caseId), eq(designVersions.id, versionId)),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id as DesignVersionId,
        designCaseId: row.designCaseId as DesignCaseId,
        version: row.version,
        parentVersionId: (row.parentVersionId ?? undefined) as DesignVersionId | undefined,
        status: row.status,
        // Verbatim. No migration, no rewrite, no canonicalization on read: the
        // stored form is what `APP6-B09` hashed and what `GRD-007` binds to.
        designDocument: row.designDocument,
        documentSchemaVersion: row.documentSchemaVersion,
        documentHash: row.documentHash ?? undefined,
        placement: toPlacement(row),
        sentAt: row.sentAt ?? undefined,
        approvedAt: row.approvedAt ?? undefined,
      };
    });
  }

  async listReviews(versionId: DesignVersionId): Promise<DesignVersionDetailReview[]> {
    return this.run('listReviews', async () => {
      const rows = await this.db
        .select(REVIEW_COLUMNS)
        .from(designReviews)
        .where(eq(designReviews.designVersionId, versionId))
        // `decided_at` then `id`, as the case-wide history read orders it:
        // `design_reviews` declares no sequence column and a bare timestamp sort
        // is not deterministic when two decisions share an instant.
        .orderBy(asc(designReviews.decidedAt), asc(designReviews.id));

      return rows.map((row) => ({
        outcome: row.outcome as DesignReviewOutcome,
        decidedAt: row.decidedAt,
        // The customer's exact words, or their exact absence. Nothing is
        // substituted from an audit entry, an outbox payload or a request note.
        feedback: row.feedback ?? undefined,
      }));
    });
  }

  async findApproval(versionId: DesignVersionId): Promise<ApprovalSnapshotEvidence | undefined> {
    return this.run('findApproval', async () => {
      const [row] = await this.db
        .select(SNAPSHOT_COLUMNS)
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.designVersionId, versionId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id as ApprovalSnapshotId,
        documentHash: row.documentHash,
        approvedAt: row.approvedAt,
        contactName: row.contactName ?? undefined,
        contactEmail: row.contactEmail ?? undefined,
        contactPhone: row.contactPhone ?? undefined,
        // Reduced to a boolean **here**, so the challenge id has no route out of
        // this method. It is computed from the column rather than hard-coded to
        // `true` so that a column later made nullable changes the answer instead
        // of silently keeping it.
        stepUpVerified: row.stepUpChallengeId !== null && row.stepUpChallengeId !== '',
        productName: row.productName,
        variantLabel: row.variantLabel ?? undefined,
        sideName: row.sideName,
        areaName: row.areaName,
        physicalWidthMm: row.physicalWidthMm,
        physicalHeightMm: row.physicalHeightMm,
        quantityTotal: row.quantityTotal,
        branch: row.customerOwnedProductId !== null ? 'CUSTOMER_OWNED' : 'CATALOG',
      };
    });
  }

  async listAgreements(snapshotId: ApprovalSnapshotId): Promise<ApprovalAgreementEvidence[]> {
    return this.run('listAgreements', async () => {
      const rows = await this.db
        .select(AGREEMENT_COLUMNS)
        .from(approvalSnapshotAgreementAcceptances)
        .where(eq(approvalSnapshotAgreementAcceptances.approvalSnapshotId, snapshotId))
        .orderBy(
          asc(approvalSnapshotAgreementAcceptances.agreementType),
          asc(approvalSnapshotAgreementAcceptances.id),
        );

      return rows.map((row) => ({
        agreementType: row.agreementType,
        contentHash: row.contentHash,
        // Frozen at approval, and the only ordering fact the acceptance row
        // itself carries. `agreement_versions.version` is deliberately not
        // joined: it lives in AGG-21, which this read has no port onto, and the
        // only port that reaches it also carries `addVersion`, `publishVersion`
        // and `withdrawVersion`.
        acceptedAt: row.acceptedAt,
      }));
    });
  }
}
