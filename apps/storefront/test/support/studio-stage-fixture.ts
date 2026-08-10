import type {
  DesignDocument,
  DesignElement,
  FreehandElement,
  GroupElement,
  ImageElement,
  ShapeElement,
  TextElement,
} from '@embroidery/design-document';
import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
  TransportDesignDocument,
} from '@embroidery/api-client';

import { makeSnapshot, PRODUCT_SLUG } from './studio-fixture';

/**
 * Fixtures for the Studio stage tests (`APP3-S02`).
 *
 * Built from the `@embroidery/design-document` types rather than hand-typed
 * literals, so a schema change breaks these at compile time instead of letting
 * a stage test keep passing against a document shape that no longer exists.
 *
 * `inter` is the only id in the controlled font registry, so it is the only one
 * a valid text fixture may name — the same constraint the running Studio is
 * under.
 */

export const CANVAS_WIDTH_PX = 1000;
export const CANVAS_HEIGHT_PX = 800;
export const CONTROLLED_FONT_ID = 'inter';

const BASE_TRANSFORM = {
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
} as const;

function base(id: string, overrides: Partial<DesignElement> = {}) {
  return {
    id,
    visible: true,
    locked: false,
    opacity: 1,
    transform: { ...BASE_TRANSFORM, ...(overrides.transform ?? {}) },
  };
}

export function textElement(id: string, overrides: Partial<TextElement> = {}): TextElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, { ...(transform === undefined ? {} : { transform }) }),
    type: 'text',
    text: 'Xin chào',
    fontId: CONTROLLED_FONT_ID,
    fontSizePx: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    fill: '#171717',
    ...rest,
  };
}

export function shapeElement(id: string, overrides: Partial<ShapeElement> = {}): ShapeElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, { ...(transform === undefined ? {} : { transform }) }),
    type: 'shape',
    shape: 'rectangle',
    fill: '#e8475f',
    stroke: '#171717',
    strokeWidthPx: 2,
    ...rest,
  };
}

export function imageElement(id: string, overrides: Partial<ImageElement> = {}): ImageElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, { ...(transform === undefined ? {} : { transform }) }),
    type: 'image',
    assetId: `asset-${id}`,
    derivativeId: `derivative-${id}`,
    intrinsicWidthPx: 400,
    intrinsicHeightPx: 240,
    ...rest,
  };
}

export function freehandElement(
  id: string,
  overrides: Partial<FreehandElement> = {},
): FreehandElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, { ...(transform === undefined ? {} : { transform }) }),
    type: 'freehand',
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ],
    stroke: '#171717',
    strokeWidthPx: 3,
    ...rest,
  };
}

export function groupElement(
  id: string,
  childIds: readonly string[],
  overrides: Partial<GroupElement> = {},
): GroupElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, { ...(transform === undefined ? {} : { transform }) }),
    type: 'group',
    childIds: [...childIds],
    ...rest,
  };
}

export function makeStageDocument(elements: readonly DesignElement[] = []): DesignDocument {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: 'side-1',
      embroideryAreaId: 'area-1',
      canvasWidthPx: CANVAS_WIDTH_PX,
      canvasHeightPx: CANVAS_HEIGHT_PX,
      physicalWidthMm: 250,
      physicalHeightMm: 200,
      pxPerMm: 4,
    },
    elements: [...elements],
  };
}

/**
 * The same document, as a Session snapshot.
 *
 * `@embroidery/api-client` carries Orval's projection of the *same* `APP3-P01`
 * types — the OpenAPI schema is generated from them — but code generation drops
 * `readonly`, so the two differ in variance and not in structure. The
 * reconciliation is spelled out once here rather than at every call site, and
 * only in test support: production code takes the payload as `unknown` and
 * hands it to `validateDesignDocumentStructure`, which is what makes the seam
 * safe rather than merely typed.
 */
export function makeStageSnapshot(
  document: DesignDocument,
  overrides: Partial<DesignSessionSnapshotResponse> = {},
): DesignSessionSnapshotResponse {
  return makeSnapshot({ document: document as unknown as TransportDesignDocument, ...overrides });
}

export function makeScope(
  overrides: Partial<DesignSessionScopeResponse> = {},
): DesignSessionScopeResponse {
  return {
    productSlug: PRODUCT_SLUG,
    sideCode: 'mat-truoc',
    areaCode: 'nguc-trai',
    canvasWidthPx: CANVAS_WIDTH_PX,
    canvasHeightPx: CANVAS_HEIGHT_PX,
    physicalWidthMm: 250,
    physicalHeightMm: 200,
    pxPerMm: 4,
    boundXPx: 100,
    boundYPx: 120,
    boundWidthPx: 300,
    boundHeightPx: 200,
    ...overrides,
  };
}
