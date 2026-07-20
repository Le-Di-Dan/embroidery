/**
 * Row → domain mapping for the AGG-08 Asset aggregate.
 */
import type {
  AssetClassification,
  AssetDerivativeKind,
  AssetDerivativeState,
  AssetInspectionOutcome,
  AssetKind,
  AssetState,
  schema,
} from '@embroidery/database';

import type {
  Asset,
  AssetDerivative,
  AssetDerivativeId,
  AssetId,
  AssetInspection,
} from '../../domain/repositories/asset.repository';

export type AssetRow = typeof schema.assets.$inferSelect;
export type DerivativeRow = typeof schema.assetDerivatives.$inferSelect;
export type InspectionRow = typeof schema.assetInspections.$inferSelect;

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id as AssetId,
    kind: row.kind as AssetKind,
    classification: row.classification as AssetClassification,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum ?? undefined,
    status: row.status as AssetState,
    deletedAt: row.deletedAt ?? undefined,
  };
}

export function toDerivative(row: DerivativeRow): AssetDerivative {
  return {
    id: row.id as AssetDerivativeId,
    assetId: row.assetId as AssetId,
    kind: row.kind as AssetDerivativeKind,
    status: row.status as AssetDerivativeState,
    storageKey: row.storageKey ?? undefined,
    isWatermarked: row.isWatermarked,
  };
}

export function toInspection(row: InspectionRow): AssetInspection {
  return {
    assetId: row.assetId as AssetId,
    outcome: row.outcome as AssetInspectionOutcome,
    detail: row.detail ?? undefined,
    inspectedAt: row.inspectedAt,
  };
}
