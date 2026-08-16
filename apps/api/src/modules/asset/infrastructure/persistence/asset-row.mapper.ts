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
    uploadedByCustomerId: row.uploadedByCustomerId ?? undefined,
    deletedAt: row.deletedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
    widthPx: row.widthPx ?? undefined,
    heightPx: row.heightPx ?? undefined,
    mediaType: row.mediaType ?? undefined,
    // `byte_size` is a bigint column; a derivative that large is not placeable
    // anyway, but the conversion is explicit rather than implicit.
    byteSize: row.byteSize === null ? undefined : Number(row.byteSize),
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
