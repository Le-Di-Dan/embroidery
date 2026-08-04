/**
 * Embroidery Area containment and physical-size validation (`IMP-D045` PO-08,
 * PO-09, PO-10).
 *
 * Containment is **blocking** and uses the complete **stroke-aware** transformed
 * AABB. Boundary equality passes; any overhang fails — including the case C1
 * exists for, where a shape's fill fits and its stroke does not.
 *
 * Nothing here moves anything. No clamp, no translate, no rotate, no scale-down,
 * no snap, no warn-and-persist. The engine reports; the caller decides the
 * workflow, and APP3 document-write APIs must treat a finding as a validation
 * failure. Silently nudging an element into the area would produce a design the
 * customer never approved and could not see they had not approved.
 */
import type { DesignDocument } from '@embroidery/design-document';

import { getElementBounds, containsBounds } from '../bounds/bounds';
import { boundsSize, type Bounds2D } from '../geometry/types';
import { quantize, quantizedAtMost } from '../geometry/quantized';
import { geometryFinding, geometryResult, type GeometryFinding } from '../findings/finding';
import type { GeometryValidationResult } from '../findings/finding';
import { buildElementGraph, drawableElements, isGeometryFinding } from '../transforms/graph';
import type { ElementGraph } from '../transforms/graph';
import type { EmbroideryAreaAuthority, PlacementAuthority } from '../placement/authority';

/** The area rectangle, in document space. */
export function areaBounds(area: EmbroideryAreaAuthority): Bounds2D {
  return {
    minX: area.boundXPx,
    minY: area.boundYPx,
    maxX: area.boundXPx + area.boundWidthPx,
    maxY: area.boundYPx + area.boundHeightPx,
  };
}

/**
 * Validates one element against the area.
 *
 * The index is carried so a finding inside a deeply nested group still names the
 * **offending descendant** rather than the group that contains it — a caller
 * telling a customer "something in this group is outside" cannot be acted on.
 */
export function validateElementWithinEmbroideryArea(
  document: DesignDocument,
  elementId: string,
  area: EmbroideryAreaAuthority,
  graph: ElementGraph = buildElementGraph(document),
): GeometryValidationResult {
  const index = graph.order.findIndex((element) => element.id === elementId);
  const path = `$.elements[${String(index < 0 ? 0 : index)}]`;
  const bounds = getElementBounds(document, elementId, graph);
  if (isGeometryFinding(bounds as never)) return geometryResult([bounds as GeometryFinding]);

  const box = bounds as Bounds2D;
  const limits = areaBounds(area);
  if (containsBounds(limits, box)) return geometryResult([]);

  return geometryResult([
    geometryFinding(
      'ELEMENT_OUT_OF_BOUNDS',
      path,
      'This element extends outside the embroidery area.',
      {
        elementId,
        meta: {
          minX: box.minX,
          minY: box.minY,
          maxX: box.maxX,
          maxY: box.maxY,
          areaMinX: limits.minX,
          areaMinY: limits.minY,
          areaMaxX: limits.maxX,
          areaMaxY: limits.maxY,
        },
      },
    ),
  ]);
}

/**
 * Validates the whole document.
 *
 * Every drawable element is checked, including hidden and locked ones: PO-08
 * says visibility is not an exemption, and a document that is only legal while
 * something is hidden becomes illegal the moment a customer unhides it.
 */
export function validateDocumentWithinEmbroideryArea(
  document: DesignDocument,
  area: EmbroideryAreaAuthority,
  graph: ElementGraph = buildElementGraph(document),
): GeometryValidationResult {
  const findings: GeometryFinding[] = [];
  for (const element of drawableElements(graph)) {
    findings.push(
      ...validateElementWithinEmbroideryArea(document, element.id, area, graph).findings,
    );
  }
  return geometryResult(findings);
}

/**
 * Validates physical size against the area's millimetre maxima.
 *
 * Uses the same stroke-aware bounds as containment and the Product Side
 * `pxPerMm` — never an area-derived ratio. Boundary equality passes; one
 * quantized unit over fails. This says nothing about stitch density, stitch
 * count or whether the design can actually be produced: that is not geometry.
 */
export function validateElementPhysicalSize(
  document: DesignDocument,
  elementId: string,
  side: PlacementAuthority,
  area: EmbroideryAreaAuthority,
  graph: ElementGraph = buildElementGraph(document),
): GeometryValidationResult {
  const index = graph.order.findIndex((element) => element.id === elementId);
  const path = `$.elements[${String(index < 0 ? 0 : index)}]`;
  const bounds = getElementBounds(document, elementId, graph);
  if (isGeometryFinding(bounds as never)) return geometryResult([bounds as GeometryFinding]);

  if (!Number.isFinite(side.pxPerMm) || side.pxPerMm <= 0) {
    return geometryResult([
      geometryFinding(
        'PX_PER_MM_MISMATCH',
        '$.placementAuthority.pxPerMm',
        'Product Side pxPerMm must be a finite number greater than zero.',
      ),
    ]);
  }

  const size = boundsSize(bounds as Bounds2D);
  const widthMm = quantize(size.width / side.pxPerMm);
  const heightMm = quantize(size.height / side.pxPerMm);
  const findings: GeometryFinding[] = [];

  for (const [dimension, actual, maximum] of [
    ['wider', widthMm, area.maxWidthMm],
    ['taller', heightMm, area.maxHeightMm],
  ] as const) {
    if (!quantizedAtMost(actual, maximum)) {
      findings.push(
        geometryFinding(
          'ELEMENT_PHYSICAL_SIZE_EXCEEDED',
          path,
          `This element is ${dimension} than the embroidery area allows.`,
          { elementId, meta: { actualMm: actual, maximumMm: quantize(maximum) } },
        ),
      );
    }
  }
  return geometryResult(findings);
}

/** Physical-size validation across every drawable element. */
export function validateDocumentPhysicalSize(
  document: DesignDocument,
  side: PlacementAuthority,
  area: EmbroideryAreaAuthority,
  graph: ElementGraph = buildElementGraph(document),
): GeometryValidationResult {
  const findings: GeometryFinding[] = [];
  for (const element of drawableElements(graph)) {
    findings.push(...validateElementPhysicalSize(document, element.id, side, area, graph).findings);
  }
  return geometryResult(findings);
}
