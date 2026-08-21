/**
 * Drizzle implementation of the AGG-11 Approval Snapshot contract
 * (TBL-031..TBL-033).
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq } from 'drizzle-orm';

import { PLACEMENT_HIERARCHY_PORT } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { PlacementHierarchyPort } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  AgreementAcceptanceInput,
  ApprovalSnapshot,
  ApprovalSnapshotId,
  ApprovalSnapshotRepository,
  CreateApprovalSnapshotInput,
  ThreadColorInput,
} from '../../domain/repositories/approval-snapshot.repository';
import type { DesignVersionId } from '../../domain/repositories/design-case.repository';
import { toSnapshot } from './design-row.mapper';

const {
  approvalSnapshots,
  approvalSnapshotThreadColors,
  approvalSnapshotAgreementAcceptances,
  designVersions,
  designCases,
} = schema;

@Injectable()
export class DrizzleApprovalSnapshotRepository
  extends DrizzleRepository
  implements ApprovalSnapshotRepository
{
  constructor(
    executor: DatabaseExecutor,
    @Inject(PLACEMENT_HIERARCHY_PORT) private readonly placement: PlacementHierarchyPort,
  ) {
    super(executor);
  }

  async createFromVersion(input: CreateApprovalSnapshotInput): Promise<ApprovalSnapshot> {
    return this.run('createFromVersion', async () => {
      const tx = this.requireTransaction('createFromVersion');

      // Read the version and its case together: the snapshot copies the
      // request and case ids from here rather than trusting a caller to
      // supply them, so the chain cannot be misdeclared.
      const [source] = await tx
        .select({ version: designVersions, designCase: designCases })
        .from(designVersions)
        .innerJoin(designCases, eq(designVersions.designCaseId, designCases.id))
        .where(eq(designVersions.id, input.designVersionId))
        .limit(1)
        .for('update', { of: designVersions });

      if (source === undefined) {
        throw notFoundError(
          'ApprovalSnapshotRepository.createFromVersion',
          'That design version does not exist.',
        );
      }

      const { version, designCase } = source;

      if (version.status !== 'SENT_FOR_REVIEW' && version.status !== 'APPROVED') {
        throw guardViolationError(
          'ApprovalSnapshotRepository.createFromVersion',
          'DESIGN_VERSION_NOT_APPROVABLE',
          'That design version is not awaiting approval.',
        );
      }

      // G-DB7-14 / GRD-007. A version sent for review always has a hash; a
      // submitted hash that differs means the document changed after the
      // customer saw it, and approving it would bind them to artwork they
      // never reviewed.
      if (version.documentHash === null) {
        throw guardViolationError(
          'ApprovalSnapshotRepository.createFromVersion',
          'DESIGN_VERSION_NOT_HASHED',
          'That design version has not been sent for review.',
        );
      }
      if (version.documentHash !== input.submittedDocumentHash) {
        throw guardViolationError(
          'ApprovalSnapshotRepository.createFromVersion',
          'APPROVAL_VERSION_MISMATCH',
          'The design changed since it was presented for approval.',
        );
      }

      // G-DB7-13: the placement frozen into the snapshot is copied from the
      // version, and re-validated here because this row outlives the version's
      // mutability window and authorises production.
      //
      // **Catalog branch only**, which is `ADR-APP6-001` §3.3's rule rather than
      // an omission — the same rule `DesignCaseRepository.createVersion`
      // already follows. A customer-owned product has no Catalog placement
      // authority to reconcile against, and running the hierarchy assertion for
      // it would require fabricating the very ids the ADR exists to prevent:
      // all four quartet columns are NULL on that branch by CST-129, so the
      // call could only pass by inventing them.
      const isCustomerOwned = version.customerOwnedProductId !== null;
      if (!isCustomerOwned) {
        await this.placement.assertValidPlacement({
          productId: version.productId as never,
          productVariantId: version.productVariantId as never,
          productSideId: version.productSideId as never,
          embroideryAreaId: version.embroideryAreaId as never,
        });
      }

      // G-DB7-16 / GRD-008: an approval with no captured terms is not evidence
      // the customer accepted any.
      if (input.agreementAcceptances.length === 0) {
        throw guardViolationError(
          'ApprovalSnapshotRepository.createFromVersion',
          'TERMS_NOT_ACCEPTED',
          'The required agreements were not accepted.',
        );
      }

      const [row] = await tx
        .insert(approvalSnapshots)
        .values({
          id: input.id,
          designVersionId: input.designVersionId,
          designCaseId: version.designCaseId,
          customRequestId: designCase.customRequestId,
          customerId: input.customerId,
          documentHash: version.documentHash,
          // Nullable authority, copied as it stands. APP6 renders no raster and
          // creates no preview derivative, so this is `NULL` on every APP6 path
          // — carried through rather than manufactured (`APP6-G01` §8).
          previewHash: version.previewHash,
          // Both branches are copied straight off the locked version row, which
          // CST-129 has already proved carries exactly one of them. Nothing here
          // chooses: CST-131 on this table is the same truth table, so a row the
          // version satisfied is a row this insert satisfies.
          productId: version.productId,
          productVariantId: version.productVariantId,
          productSideId: version.productSideId,
          embroideryAreaId: version.embroideryAreaId,
          customerOwnedProductId: version.customerOwnedProductId,
          productName: input.productName,
          variantLabel: input.variantLabel ?? null,
          sideName: input.sideName,
          areaName: input.areaName,
          physicalWidthMm: version.physicalWidthMm,
          physicalHeightMm: version.physicalHeightMm,
          quantityTotal: input.quantityTotal,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          grantId: input.grantId,
          stepUpChallengeId: input.stepUpChallengeId,
          approvedAt: input.approvedAt,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'ApprovalSnapshotRepository.createFromVersion',
          'APPROVAL_NOT_CREATED',
          'Could not record the approval.',
        );
      }

      if (input.threadColors.length > 0) {
        await tx.insert(approvalSnapshotThreadColors).values(
          input.threadColors.map((color) => ({
            approvalSnapshotId: input.id,
            position: color.position,
            colorCode: color.colorCode,
            colorName: color.colorName ?? null,
          })),
        );
      }

      await tx.insert(approvalSnapshotAgreementAcceptances).values(
        input.agreementAcceptances.map((acceptance) => ({
          approvalSnapshotId: input.id,
          agreementVersionId: acceptance.agreementVersionId,
          agreementType: acceptance.agreementType,
          contentHash: acceptance.contentHash,
          acceptedAt: input.approvedAt,
        })),
      );

      return toSnapshot(row);
    });
  }

  async findByDesignVersion(
    designVersionId: DesignVersionId,
  ): Promise<ApprovalSnapshot | undefined> {
    return this.run('findByDesignVersion', async () => {
      const [row] = await this.db
        .select()
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.designVersionId, designVersionId))
        .limit(1);
      return row === undefined ? undefined : toSnapshot(row);
    });
  }

  async findById(id: ApprovalSnapshotId): Promise<ApprovalSnapshot | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.id, id))
        .limit(1);
      return row === undefined ? undefined : toSnapshot(row);
    });
  }

  async listThreadColors(id: ApprovalSnapshotId): Promise<ThreadColorInput[]> {
    return this.run('listThreadColors', async () => {
      const rows = await this.db
        .select()
        .from(approvalSnapshotThreadColors)
        .where(eq(approvalSnapshotThreadColors.approvalSnapshotId, id))
        .orderBy(asc(approvalSnapshotThreadColors.position));

      return rows.map((row) => ({
        position: row.position,
        colorCode: row.colorCode,
        colorName: row.colorName ?? undefined,
      }));
    });
  }

  async listAgreementAcceptances(id: ApprovalSnapshotId): Promise<AgreementAcceptanceInput[]> {
    return this.run('listAgreementAcceptances', async () => {
      const rows = await this.db
        .select()
        .from(approvalSnapshotAgreementAcceptances)
        .where(eq(approvalSnapshotAgreementAcceptances.approvalSnapshotId, id));

      return rows.map((row) => ({
        agreementVersionId: row.agreementVersionId,
        agreementType: row.agreementType,
        contentHash: row.contentHash,
      }));
    });
  }
}
