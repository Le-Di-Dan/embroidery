/**
 * Placement authority reconciliation (`IMP-D045` PO-10, PO-11; `IMP-D041`).
 *
 * The authority arrives as an argument. This package imports no database
 * schema — partly to stay browser-safe, but mostly because a geometry engine
 * that could reach a database would be a geometry engine that sometimes did.
 *
 * The document's placement snapshot is **document data, not authority** (P01
 * §5.1). This file proves the two agree; when they disagree it reports, and
 * never silently substitutes the authority's value — a document whose stored
 * geometry was quietly rewritten is a design the customer never approved.
 */
import type { DesignPlacementSnapshot } from '@embroidery/design-document';

import { quantizedEquals } from '../geometry/quantized';
import { geometryFinding, geometryResult, type GeometryFinding } from '../findings/finding';
import type { GeometryValidationResult } from '../findings/finding';

/** Product Side authority, mirroring the DB01 columns without importing them. */
export interface PlacementAuthority {
  readonly productSideId: string;
  readonly code: string;
  /** ISO instant, or `null` when the side is still selectable. */
  readonly retiredAt: string | null;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
}

export interface EmbroideryAreaAuthority {
  readonly embroideryAreaId: string;
  readonly productSideId: string;
  readonly code: string;
  readonly retiredAt: string | null;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm: number;
  readonly maxHeightMm: number;
}

/**
 * Why the placement is being validated.
 *
 * `NEW_EDITING` refuses a retired row; `HISTORICAL_RENDER` accepts the exact row
 * an existing document already references. Retirement is not deletion (PO-11),
 * and conflating the two would either break every historical design or let a
 * customer start a new one on a placement the store has withdrawn.
 */
export type PlacementValidationMode = 'NEW_EDITING' | 'HISTORICAL_RENDER';

const PATH = '$.placement';

function mismatch(field: string, documentValue: number, authorityValue: number): GeometryFinding {
  return geometryFinding(
    'PLACEMENT_AUTHORITY_MISMATCH',
    `${PATH}.${field}`,
    'The stored placement value does not match Product Side authority.',
    { meta: { documentValue, authorityValue } },
  );
}

/**
 * Validates a document placement snapshot against caller-supplied authority.
 *
 * Numeric comparison is exact **after quantization** on both sides — PO-09
 * forbids an epsilon here, and quantizing both is symmetric where a tolerance
 * would be a second, unruled precision.
 */
export function validatePlacementSnapshot(
  snapshot: DesignPlacementSnapshot,
  side: PlacementAuthority,
  area: EmbroideryAreaAuthority,
  mode: PlacementValidationMode = 'NEW_EDITING',
): GeometryValidationResult {
  const findings: GeometryFinding[] = [];

  if (snapshot.productSideId !== side.productSideId) {
    findings.push(
      geometryFinding(
        'PLACEMENT_SIDE_MISMATCH',
        `${PATH}.productSideId`,
        'This document was authored against a different Product Side.',
      ),
    );
  }
  if (snapshot.embroideryAreaId !== area.embroideryAreaId) {
    findings.push(
      geometryFinding(
        'PLACEMENT_AREA_MISMATCH',
        `${PATH}.embroideryAreaId`,
        'This document was authored against a different Embroidery Area.',
      ),
    );
  }
  // An area belonging to another side would make every bound meaningless.
  if (area.productSideId !== side.productSideId) {
    findings.push(
      geometryFinding(
        'PLACEMENT_AREA_MISMATCH',
        `${PATH}.embroideryAreaId`,
        'This Embroidery Area belongs to a different Product Side.',
      ),
    );
  }

  for (const [field, documentValue, authorityValue] of [
    ['canvasWidthPx', snapshot.canvasWidthPx, side.imageWidthPx],
    ['canvasHeightPx', snapshot.canvasHeightPx, side.imageHeightPx],
    ['physicalWidthMm', snapshot.physicalWidthMm, side.physicalWidthMm],
    ['physicalHeightMm', snapshot.physicalHeightMm, side.physicalHeightMm],
    ['pxPerMm', snapshot.pxPerMm, side.pxPerMm],
  ] as const) {
    if (!quantizedEquals(documentValue, authorityValue)) {
      findings.push(mismatch(field, documentValue, authorityValue));
    }
  }

  if (mode === 'NEW_EDITING') {
    // Retired rows stay renderable; they are simply no longer selectable.
    if (side.retiredAt !== null) {
      findings.push(
        geometryFinding(
          'PLACEMENT_RETIRED',
          `${PATH}.productSideId`,
          'This Product Side has been retired and cannot be chosen for a new design.',
        ),
      );
    }
    if (area.retiredAt !== null) {
      findings.push(
        geometryFinding(
          'PLACEMENT_RETIRED',
          `${PATH}.embroideryAreaId`,
          'This Embroidery Area has been retired and cannot be chosen for a new design.',
        ),
      );
    }
  }

  return geometryResult(findings);
}
