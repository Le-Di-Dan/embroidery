/**
 * Terminal-effect verification (APP2-W01 §18).
 *
 * A terminal asset is only a *replay* if the whole effect is there and internally
 * consistent. Anything else is a contradiction and fails closed: an `ACCEPTED`
 * asset whose preview is missing is not "already done", it is a bug whose
 * evidence must survive long enough for someone to read it.
 *
 * Pure functions over already-read rows, so the rules are testable without a
 * database and the repository stays a data-access layer.
 */
import type { DerivativeRowState } from '../../domain/repositories/asset-inspection.repository';
import type { CatalogDerivativeKind } from '../../domain/asset-processing-policy';
import { laneDerivativeKinds, type AssetInspectionLane } from '../../domain/asset-inspection-lane';
import { contradiction } from '../../domain/inspection-contradiction';
import { decodeInspectionDetail } from '../../domain/inspection-detail.codec';
import type { InspectionDetail } from '../../domain/inspection-detail';

export interface InspectionRow {
  readonly outcome: string;
  readonly detail: string | null;
}

export type ExpectedDerivativeKeys = Readonly<Record<CatalogDerivativeKind, string>>;

/** Exactly one inspection row, with the expected outcome and a valid V1 detail. */
function requireSoleInspection(
  inspections: readonly InspectionRow[],
  outcome: 'ACCEPTED' | 'REJECTED',
  lane: AssetInspectionLane,
): InspectionDetail {
  if (inspections.length === 0) {
    throw contradiction('terminal asset has no inspection');
  }
  if (inspections.length > 1) {
    throw contradiction('terminal asset has duplicate inspections');
  }
  const [only] = inspections;
  if (only === undefined || only.outcome !== outcome) {
    throw contradiction('inspection outcome does not match the asset state');
  }
  const detail = decodeInspectionDetail(only.detail, laneDerivativeKinds(lane));
  if (detail === undefined || detail.result !== outcome) {
    throw contradiction('inspection detail is malformed or of an unsupported schema');
  }
  return detail;
}

/** The single non-FAILED row for a kind, or undefined. */
function rowFor(
  derivatives: readonly DerivativeRowState[],
  kind: string,
): DerivativeRowState | undefined {
  const matches = derivatives.filter((row) => row.kind === kind && row.status !== 'FAILED');
  if (matches.length > 1) {
    // `uq_asset_derivatives__asset_kind__not_failed` makes this unreachable;
    // checked anyway, because a dropped index would otherwise turn into a
    // silently wrong replay rather than a loud stop.
    throw contradiction('more than one live derivative for a kind');
  }
  return matches[0];
}

/**
 * Verifies the accepted effect for **this lane's** derivatives.
 *
 * Only the lane's own kinds are examined, which is what lets the Session lane —
 * whose inspection writes no derivative at all — replay correctly. It also has
 * to ignore other kinds rather than merely tolerate them: by the time a Session
 * upload's inspection event is redelivered, `APP3-W01A` may already have written
 * the `NORMALIZED` derivative, and a loop over every row would read that as an
 * unexpected derivative on an accepted asset and stop a valid replay.
 */
export function verifyAcceptedReplay(
  inspections: readonly InspectionRow[],
  derivatives: readonly DerivativeRowState[],
  expectedKeys: ExpectedDerivativeKeys,
  lane: AssetInspectionLane,
): readonly string[] {
  const detail = requireSoleInspection(inspections, 'ACCEPTED', lane);
  if (detail.result !== 'ACCEPTED') {
    throw contradiction('accepted asset carries a rejected inspection');
  }

  const keys: string[] = [];
  for (const kind of laneDerivativeKinds(lane)) {
    const row = rowFor(derivatives, kind);
    if (row === undefined) {
      throw contradiction('accepted asset is missing a derivative');
    }
    if (row.status !== 'READY') {
      throw contradiction('accepted asset has a derivative that is not READY');
    }
    if (row.isWatermarked) {
      throw contradiction('catalog derivative is marked watermarked');
    }
    if (row.storageKey !== expectedKeys[kind as CatalogDerivativeKind]) {
      throw contradiction('derivative storage key is not the deterministic key');
    }
    const recorded = detail.derivatives.find((entry) => entry.kind === kind);
    if (recorded === undefined || recorded.checksum !== row.checksum) {
      throw contradiction('derivative checksum disagrees with the inspection record');
    }
    keys.push(row.storageKey);
  }
  return keys;
}

export function verifyRejectedReplay(
  inspections: readonly InspectionRow[],
  derivatives: readonly DerivativeRowState[],
  lane: AssetInspectionLane,
): void {
  requireSoleInspection(inspections, 'REJECTED', lane);
  const owned = laneDerivativeKinds(lane);
  for (const row of derivatives) {
    // Unconditional, and deliberately not narrowed to the lane: a READY
    // derivative of *any* kind is a resolvable reference to media that was
    // rejected, whoever wrote it.
    if (row.status === 'READY') {
      throw contradiction('rejected asset still exposes a READY derivative');
    }
    if (owned.includes(row.kind) && row.status !== 'FAILED') {
      throw contradiction('rejected asset has a derivative that is not FAILED');
    }
  }
}
