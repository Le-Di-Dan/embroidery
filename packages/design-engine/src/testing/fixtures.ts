/**
 * Deterministic fixtures. Test-only: excluded from the published build.
 *
 * Every builder returns a fresh graph so a suite that proves "this does not
 * mutate its input" cannot be satisfied by a shared object nothing touched.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import type { EmbroideryAreaAuthority, PlacementAuthority } from '../placement/authority';

type Overrides = Record<string, unknown>;

export function transform(overrides: Overrides = {}) {
  return { x: 0, y: 0, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1, ...overrides };
}

export function placement(overrides: Overrides = {}) {
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

export function textElement(overrides: Overrides = {}): DesignElement {
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

export function imageElement(overrides: Overrides = {}): DesignElement {
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

export function shapeElement(overrides: Overrides = {}): DesignElement {
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
    strokeWidthPx: 0,
    ...overrides,
  };
}

export function freehandElement(overrides: Overrides = {}): DesignElement {
  return {
    id: 'freehand-1',
    type: 'freehand',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 20 },
      { x: 80, y: 0 },
    ],
    stroke: '#000000',
    strokeWidthPx: 0,
    ...overrides,
  };
}

export function groupElement(overrides: Overrides = {}): DesignElement {
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

export function documentWith(elements: readonly DesignElement[]): DesignDocument {
  return { schemaVersion: 1, placement: placement(), elements };
}

/** A Product Side whose two axes agree with `pxPerMm` exactly. */
export function sideAuthority(overrides: Partial<PlacementAuthority> = {}): PlacementAuthority {
  return {
    productSideId: 'side-front',
    code: 'front',
    retiredAt: null,
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    physicalWidthMm: 200,
    physicalHeightMm: 200,
    pxPerMm: 5,
    ...overrides,
  };
}

export function areaAuthority(
  overrides: Partial<EmbroideryAreaAuthority> = {},
): EmbroideryAreaAuthority {
  return {
    embroideryAreaId: 'area-chest',
    productSideId: 'side-front',
    code: 'chest',
    retiredAt: null,
    boundXPx: 100,
    boundYPx: 100,
    boundWidthPx: 400,
    boundHeightPx: 300,
    maxWidthMm: 80,
    maxHeightMm: 60,
    ...overrides,
  };
}

/** A chain of `depth` nested groups wrapping one leaf, each offset by `step`. */
export function nestedGroups(depth: number, step = 10): DesignElement[] {
  const leaf = textElement({ id: 'leaf', transform: transform({ x: 0, y: 0 }) });
  const elements: DesignElement[] = [leaf];
  let childId = 'leaf';
  for (let level = 0; level < depth; level += 1) {
    const id = `group-${String(level)}`;
    elements.push(
      groupElement({ id, childIds: [childId], transform: transform({ x: step, y: step }) }),
    );
    childId = id;
  }
  return elements;
}
