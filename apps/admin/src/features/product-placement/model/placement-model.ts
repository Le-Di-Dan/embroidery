/**
 * The placement read model, normalized once at the client boundary.
 *
 * `APP3-B01` really answers `number | null` for the physical maxima and
 * `string | null` for `retiredAt`/`supersededById` — the projection converts
 * every `numeric` column at exactly one point and the integration tests pin the
 * shape. The *generated* types say `{ [key: string]: unknown } | null`, because
 * the nullable response members reach the OpenAPI document as empty schemas.
 * That is a publication defect in the contract, not a difference in the data.
 *
 * `APP3-A01` may not change the contract (`§23`), so the weakness is absorbed
 * here, in one file, by narrowing each value to the type the server documents
 * and refusing anything else. Every other module in this feature works with
 * `PlacementModel` and never sees the generated shape — so when the contract is
 * republished correctly, this is the only file that changes.
 *
 * Recorded as `FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01`.
 */
import type {
  AdminPlacementAreaResponse,
  AdminPlacementSideResponse,
  AdminProductPlacementResponse,
} from '@embroidery/api-client';

export interface PlacementArea {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm: number | null;
  readonly maxHeightMm: number | null;
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
}

export interface PlacementSide {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
  readonly areas: readonly PlacementArea[];
}

export interface PlacementModel {
  readonly productId: string;
  readonly productStatus: string;
  /** The concurrency token the next replace must echo back. */
  readonly updatedAt: string;
  readonly sides: readonly PlacementSide[];
}

/**
 * A nullable number as the server documents it.
 *
 * Anything that is not a finite number becomes `null` — "no limit" — rather
 * than `NaN` or a coerced `0`. A fabricated `0` would render as a real maximum
 * of zero millimetres and make every area look invalid.
 */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A nullable string as the server documents it; never a stringified object. */
function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeArea(response: AdminPlacementAreaResponse): PlacementArea {
  return {
    id: response.id,
    code: response.code,
    name: response.name,
    displayOrder: response.displayOrder,
    boundXPx: response.boundXPx,
    boundYPx: response.boundYPx,
    boundWidthPx: response.boundWidthPx,
    boundHeightPx: response.boundHeightPx,
    maxWidthMm: optionalNumber(response.maxWidthMm),
    maxHeightMm: optionalNumber(response.maxHeightMm),
    retiredAt: optionalString(response.retiredAt),
    supersededById: optionalString(response.supersededById),
  };
}

export function normalizeSide(response: AdminPlacementSideResponse): PlacementSide {
  return {
    id: response.id,
    code: response.code,
    name: response.name,
    displayOrder: response.displayOrder,
    backgroundAssetId: response.backgroundAssetId,
    imageWidthPx: response.imageWidthPx,
    imageHeightPx: response.imageHeightPx,
    physicalWidthMm: response.physicalWidthMm,
    physicalHeightMm: response.physicalHeightMm,
    pxPerMm: response.pxPerMm,
    retiredAt: optionalString(response.retiredAt),
    supersededById: optionalString(response.supersededById),
    areas: response.areas.map(normalizeArea),
  };
}

export function normalizePlacement(response: AdminProductPlacementResponse): PlacementModel {
  return {
    productId: response.productId,
    productStatus: response.productStatus,
    updatedAt: response.updatedAt,
    sides: response.sides.map(normalizeSide),
  };
}

/** True once the row is withdrawn from new selection. Never a deletion. */
export function isRetired(row: { readonly retiredAt: string | null }): boolean {
  return row.retiredAt !== null;
}
