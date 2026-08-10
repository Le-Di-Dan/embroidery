/**
 * Turning the Session's own placement into the authorities `APP3-P02` validates
 * against, and ruling on a candidate transform (`APP3-S03`).
 *
 * No new API is called for this. The Session scope `APP3-B07` already returned
 * carries the Side's `pxPerMm` and the safe-area rectangle, and the physical
 * maxima come from the public placement manifest `APP3-S01` already fetched —
 * captured once when the Session opened, never re-read live, so a later change
 * to the manifest cannot retarget an open Session.
 *
 * ## Validation blocks; it never repairs
 *
 * `IMP-D045` PO-09 is explicit that clamping, translating, rotating, scaling
 * down, snapping and warn-but-persist are all forbidden. So a candidate is
 * either committed exactly as computed or not committed at all. The refusal is
 * stated in text; the element stays where the customer last had it legally.
 */
import {
  type DesignDocument,
  type DesignElementTransform,
  quantizeDesignDocument,
  validateDesignDocumentStructure,
} from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';
import {
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
  buildElementGraph,
  validateElementPhysicalSize,
  validateElementWithinEmbroideryArea,
} from '@embroidery/design-engine';

/**
 * The physical maxima of the Embroidery Area the Session opened on.
 *
 * `null` for either axis means, in the manifest's own words, that the Side
 * itself is the only limit — so the Side's physical dimension is the maximum
 * rather than "no maximum at all".
 */
export interface StudioAreaLimits {
  readonly maxWidthMm: number | null;
  readonly maxHeightMm: number | null;
}

export type TransformRefusal =
  'unreadable-candidate' | 'outside-embroidery-area' | 'too-large-for-area';

export type TransformOutcome =
  | { readonly ok: true; readonly document: DesignDocument }
  | { readonly ok: false; readonly refusal: TransformRefusal };

/**
 * The limits an Embroidery Area declares in the public placement manifest.
 *
 * Read defensively because the generated client types both fields as
 * `{ [key: string]: unknown } | null` rather than `number | null` — an Orval
 * artifact for a nullable number, in generated source no checkpoint may edit.
 * Anything that is not a finite number is treated as "no declared maximum",
 * which the manifest itself defines as the Side being the only limit.
 */
export function areaLimitsOf(area: {
  readonly maxWidthMm?: unknown;
  readonly maxHeightMm?: unknown;
}): StudioAreaLimits {
  return {
    maxWidthMm: finiteOrNull(area.maxWidthMm),
    maxHeightMm: finiteOrNull(area.maxHeightMm),
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function placementAuthorityOf(scope: DesignSessionScopeResponse): PlacementAuthority {
  return {
    productSideId: scope.sideCode,
    code: scope.sideCode,
    retiredAt: null,
    imageWidthPx: scope.canvasWidthPx,
    imageHeightPx: scope.canvasHeightPx,
    physicalWidthMm: scope.physicalWidthMm,
    physicalHeightMm: scope.physicalHeightMm,
    pxPerMm: scope.pxPerMm,
  };
}

export function areaAuthorityOf(
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): EmbroideryAreaAuthority {
  return {
    embroideryAreaId: scope.areaCode,
    productSideId: scope.sideCode,
    code: scope.areaCode,
    retiredAt: null,
    boundXPx: scope.boundXPx,
    boundYPx: scope.boundYPx,
    boundWidthPx: scope.boundWidthPx,
    boundHeightPx: scope.boundHeightPx,
    maxWidthMm: limits?.maxWidthMm ?? scope.physicalWidthMm,
    maxHeightMm: limits?.maxHeightMm ?? scope.physicalHeightMm,
  };
}

/** The candidate document, with one element's transform replaced. */
export function withTransform(
  document: DesignDocument,
  elementId: string,
  transform: DesignElementTransform,
): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      element.id === elementId ? { ...element, transform } : element,
    ),
  };
}

/**
 * Rules on a candidate document, in the order that makes each answer meaningful.
 *
 * Structure first, because a non-finite or zero-scale number is not a geometry
 * question and `APP3-P02` would be asked to measure something that cannot
 * exist. Containment next, then physical size — both against the **stroke-aware
 * transformed AABB** the engine computes, never the untransformed box.
 */
export function ruleOnCandidate(
  candidate: DesignDocument,
  elementId: string,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): TransformOutcome {
  const structure = validateDesignDocumentStructure(candidate);
  if (!structure.ok) return { ok: false, refusal: 'unreadable-candidate' };

  /*
   * Quantize, then measure the quantized document — not the other way round.
   *
   * `IMP-D045` PO-09 checks containment "after P01 quantization", and it has to:
   * a candidate that fits by 0.00004 px passes on the raw number and fails once
   * the value it will actually be stored as is written. Validating the raw
   * candidate and committing the quantized one would let exactly that overhang
   * through, one ten-thousandth of a pixel at a time.
   */
  const document = quantizeDesignDocument(structure.value);
  const graph = buildElementGraph(document);
  const area = areaAuthorityOf(scope, limits);

  if (!validateElementWithinEmbroideryArea(document, elementId, area, graph).ok) {
    return { ok: false, refusal: 'outside-embroidery-area' };
  }
  if (
    !validateElementPhysicalSize(document, elementId, placementAuthorityOf(scope), area, graph).ok
  ) {
    return { ok: false, refusal: 'too-large-for-area' };
  }
  return { ok: true, document };
}
