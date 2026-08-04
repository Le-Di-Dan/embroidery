/**
 * Deterministic fixtures. Test-only: excluded from the published build.
 *
 * Every builder returns a fresh object graph so a test that mutates its input
 * cannot leak into the next one — which matters here, because several suites
 * exist specifically to prove that production code does *not* mutate what it is
 * given.
 */
import type { DesignDocument, DesignPlacementSnapshot } from '../schema/document';
import type { DesignElement, DesignElementTransform } from '../schema/elements';
import type { DerivativeAuthorityRecord, DesignDocumentContext } from '../validation/context';

export function transform(overrides: Partial<DesignElementTransform> = {}): DesignElementTransform {
  return {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function placement(
  overrides: Partial<DesignPlacementSnapshot> = {},
): DesignPlacementSnapshot {
  return {
    productSideId: 'side-front',
    embroideryAreaId: 'area-chest',
    canvasWidthPx: 1000,
    canvasHeightPx: 1000,
    physicalWidthMm: 200,
    physicalHeightMm: 200,
    pxPerMm: 5,
    ...overrides,
  };
}

export function textElement(overrides: Partial<Record<string, unknown>> = {}): DesignElement {
  return {
    id: 'text-1',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    text: 'Thêu',
    fontId: 'inter',
    fontSizePx: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    fill: '#101010',
    ...overrides,
  };
}

export function imageElement(overrides: Partial<Record<string, unknown>> = {}): DesignElement {
  return {
    id: 'image-1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    assetId: 'asset-1',
    derivativeId: 'derivative-1',
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
    ...overrides,
  };
}

export function shapeElement(overrides: Partial<Record<string, unknown>> = {}): DesignElement {
  return {
    id: 'shape-1',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    shape: 'rectangle',
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidthPx: 2,
    ...overrides,
  };
}

export function freehandElement(overrides: Partial<Record<string, unknown>> = {}): DesignElement {
  return {
    id: 'freehand-1',
    type: 'freehand',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ],
    stroke: '#000000',
    strokeWidthPx: 1,
    ...overrides,
  };
}

export function groupElement(overrides: Partial<Record<string, unknown>> = {}): DesignElement {
  return {
    id: 'group-1',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    childIds: ['text-1'],
    ...overrides,
  };
}

/** A valid document with no elements — the smallest thing that validates. */
export function emptyDocument(): DesignDocument {
  return { schemaVersion: 1, placement: placement(), elements: [] };
}

export function documentWith(elements: readonly DesignElement[]): DesignDocument {
  return { schemaVersion: 1, placement: placement(), elements };
}

export function derivative(
  overrides: Partial<DerivativeAuthorityRecord> = {},
): DerivativeAuthorityRecord {
  return {
    derivativeId: 'derivative-1',
    assetId: 'asset-1',
    kind: 'NORMALIZED',
    status: 'READY',
    widthPx: 800,
    heightPx: 600,
    mediaType: 'image/webp',
    byteSize: 65_536,
    ...overrides,
  };
}

export function context(records: readonly DerivativeAuthorityRecord[]): DesignDocumentContext {
  return { derivatives: new Map(records.map((record) => [record.derivativeId, record])) };
}

/** `n` text elements with distinct ids, for boundary counting. */
export function repeatText(
  count: number,
  overrides: Record<string, unknown> = {},
): DesignElement[] {
  return Array.from({ length: count }, (_unused, index) =>
    textElement({ id: `text-${String(index)}`, ...overrides }),
  );
}

/** `n` image elements, optionally all pointing at one derivative. */
export function repeatImage(count: number, sharedDerivative = false): DesignElement[] {
  return Array.from({ length: count }, (_unused, index) =>
    imageElement({
      id: `image-${String(index)}`,
      assetId: sharedDerivative ? 'asset-1' : `asset-${String(index)}`,
      derivativeId: sharedDerivative ? 'derivative-1' : `derivative-${String(index)}`,
    }),
  );
}

/** A chain of `depth` nested groups wrapping one text element. */
export function nestedGroups(depth: number): DesignElement[] {
  const leaf = textElement({ id: 'leaf' });
  const elements: DesignElement[] = [leaf];
  let childId = 'leaf';
  for (let level = 0; level < depth; level += 1) {
    const id = `group-${String(level)}`;
    elements.push(groupElement({ id, childIds: [childId] }));
    childId = id;
  }
  return elements;
}
