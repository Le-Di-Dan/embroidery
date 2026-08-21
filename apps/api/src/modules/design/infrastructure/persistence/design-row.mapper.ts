/**
 * Row → domain mapping for the AGG-10 Design Case and AGG-11 Approval Snapshot
 * aggregates.
 */
import type {
  DesignSessionState,
  DesignTemplateState,
  DesignVersionState,
  schema,
} from '@embroidery/database';

import type {
  DesignCase,
  DesignCaseId,
  DesignVersion,
  DesignVersionId,
  DesignVersionPlacement,
} from '../../domain/repositories/design-case.repository';
import type {
  ApprovalSnapshot,
  ApprovalSnapshotId,
} from '../../domain/repositories/approval-snapshot.repository';
import type {
  DesignSession,
  DesignSessionId,
} from '../../domain/repositories/design-session.repository';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateVersion,
  DesignTemplateVersionId,
} from '../../domain/repositories/design-template.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export type CaseRow = typeof schema.designCases.$inferSelect;
export type VersionRow = typeof schema.designVersions.$inferSelect;
export type SnapshotRow = typeof schema.approvalSnapshots.$inferSelect;
export type TemplateRow = typeof schema.designTemplates.$inferSelect;
export type TemplateVersionRow = typeof schema.designTemplateVersions.$inferSelect;
export type SessionRow = typeof schema.designSessions.$inferSelect;

export function toCase(row: CaseRow): DesignCase {
  return {
    id: row.id as DesignCaseId,
    customRequestId: row.customRequestId,
    currentVersionId: (row.currentVersionId ?? undefined) as DesignVersionId | undefined,
  };
}

/**
 * Reads the row's placement back as whichever branch it actually carries
 * (CST-129, `ADR-APP6-001` §3.2).
 *
 * The COP column is the discriminator, and it is read **first**, because it is
 * the one column CST-129 guarantees is decisive: on a Catalog row it is NULL and
 * all four quartet columns are present, on a COP row it is present and all four
 * are NULL. Branching on `productId` instead would give the same answer today
 * and a silently wrong one the first time a column is added.
 *
 * The non-null assertions on each branch are CST-129 restated in TypeScript, not
 * optimism: the constraint rejects a partial quartet and a missing label at write
 * time, so a row that reached this function cannot be missing them. If one ever
 * were, the branch would surface it as a null in a typed field rather than
 * inventing a value — which is why nothing here supplies a fallback.
 */
function toVersionPlacement(row: VersionRow): DesignVersionPlacement {
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

export function toVersion(row: VersionRow): DesignVersion {
  return {
    id: row.id as DesignVersionId,
    designCaseId: row.designCaseId as DesignCaseId,
    version: row.version,
    parentVersionId: (row.parentVersionId ?? undefined) as DesignVersionId | undefined,
    status: row.status as DesignVersionState,
    designDocument: row.designDocument,
    documentSchemaVersion: row.documentSchemaVersion,
    documentHash: row.documentHash ?? undefined,
    placement: toVersionPlacement(row),
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

export function toTemplate(row: TemplateRow): DesignTemplate {
  return {
    id: row.id as DesignTemplateId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    productId: (row.productId ?? undefined) as ProductId | undefined,
    productSideId: (row.productSideId ?? undefined) as ProductSideId | undefined,
    embroideryAreaId: (row.embroideryAreaId ?? undefined) as EmbroideryAreaId | undefined,
    status: row.status as DesignTemplateState,
    currentVersion: row.currentVersion,
    previewDerivativeId: row.previewDerivativeId ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTemplateVersion(row: TemplateVersionRow): DesignTemplateVersion {
  return {
    id: row.id as DesignTemplateVersionId,
    designTemplateId: row.designTemplateId as DesignTemplateId,
    version: row.version,
    designDocument: row.designDocument,
    documentSchemaVersion: row.documentSchemaVersion,
    publishedAt: row.publishedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function toSession(row: SessionRow): DesignSession {
  return {
    id: row.id as DesignSessionId,
    sessionSecretHash: row.sessionSecretHash,
    productId: row.productId as ProductId,
    productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
    productSideId: row.productSideId as ProductSideId,
    embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
    designDocument: row.designDocument,
    documentSchemaVersion: row.documentSchemaVersion,
    autosaveRevision: row.autosaveRevision,
    templateId: (row.templateId ?? undefined) as DesignTemplateId | undefined,
    templateVersion: row.templateVersion ?? undefined,
    status: row.status as DesignSessionState,
    expiresAt: row.expiresAt,
    lastActivityAt: row.lastActivityAt,
    submittedRequestId: row.submittedRequestId ?? undefined,
  };
}
