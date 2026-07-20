/**
 * Row → domain mapping for the AGG-10 Design Case and AGG-11 Approval Snapshot
 * aggregates.
 */
import type { DesignVersionState, schema } from '@embroidery/database';

import type {
  DesignCase,
  DesignCaseId,
  DesignVersion,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import type {
  ApprovalSnapshot,
  ApprovalSnapshotId,
} from '../../domain/repositories/approval-snapshot.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export type CaseRow = typeof schema.designCases.$inferSelect;
export type VersionRow = typeof schema.designVersions.$inferSelect;
export type SnapshotRow = typeof schema.approvalSnapshots.$inferSelect;

export function toCase(row: CaseRow): DesignCase {
  return {
    id: row.id as DesignCaseId,
    customRequestId: row.customRequestId,
    currentVersionId: (row.currentVersionId ?? undefined) as DesignVersionId | undefined,
  };
}

export function toVersion(row: VersionRow): DesignVersion {
  return {
    id: row.id as DesignVersionId,
    designCaseId: row.designCaseId as DesignCaseId,
    version: row.version,
    status: row.status as DesignVersionState,
    designDocument: row.designDocument,
    documentSchemaVersion: row.documentSchemaVersion,
    documentHash: row.documentHash ?? undefined,
    placement: {
      productId: row.productId as ProductId,
      productVariantId: row.productVariantId as ProductVariantId,
      productSideId: row.productSideId as ProductSideId,
      embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
      physicalWidthMm: row.physicalWidthMm,
      physicalHeightMm: row.physicalHeightMm,
    },
    sentAt: row.sentAt ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
  };
}

export function toSnapshot(row: SnapshotRow): ApprovalSnapshot {
  return {
    id: row.id as ApprovalSnapshotId,
    designVersionId: row.designVersionId as DesignVersionId,
    designCaseId: row.designCaseId as DesignCaseId,
    customRequestId: row.customRequestId,
    customerId: row.customerId,
    documentHash: row.documentHash,
    placement: {
      productId: row.productId as ProductId,
      productVariantId: row.productVariantId as ProductVariantId,
      productSideId: row.productSideId as ProductSideId,
      embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
      physicalWidthMm: row.physicalWidthMm,
      physicalHeightMm: row.physicalHeightMm,
    },
    productName: row.productName,
    sideName: row.sideName,
    areaName: row.areaName,
    quantityTotal: row.quantityTotal,
    approvedAt: row.approvedAt,
  };
}
