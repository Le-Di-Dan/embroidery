/**
 * Fixtures for the Design Template editor (`APP3-A03`).
 *
 * Two properties are load-bearing rather than convenient.
 *
 * A detail response for a Template that has never been saved carries **no**
 * `currentVersion` and **no** `document` — that is what `APP3-B03` actually
 * returns, and a fixture that supplied either would let the screen pass a test
 * the real API could never satisfy.
 *
 * The placement fixture's Side and Area ids are the exact ids the scope names.
 * Resolution is by id, so a fixture whose ids merely *looked* related would hide
 * the very failure the unresolved-scope tests exist to prove.
 */
import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  type DesignDocument,
  type DesignElement,
} from '@embroidery/design-document';
import type {
  AdminDesignTemplateDetailResponse,
  AdminProductPlacementResponse,
} from '@embroidery/api-client';

export const EDITOR_TEMPLATE_ID = '01930000-0000-7000-8000-0000000000e1';
export const EDITOR_PRODUCT_ID = '01920000-0000-7000-8000-0000000000c1';
export const EDITOR_SIDE_ID = '01920000-0000-7000-8000-0000000000a1';
export const EDITOR_AREA_ID = '01920000-0000-7000-8000-0000000000b1';

export const EDITOR_SCOPE = {
  productId: EDITOR_PRODUCT_ID,
  productSideId: EDITOR_SIDE_ID,
  embroideryAreaId: EDITOR_AREA_ID,
} as const;

export function makePlacement(
  overrides: Record<string, unknown> = {},
): AdminProductPlacementResponse {
  return {
    productId: EDITOR_PRODUCT_ID,
    productStatus: 'DRAFT',
    updatedAt: '2026-08-08T10:00:00.000Z',
    sides: [
      {
        id: EDITOR_SIDE_ID,
        code: 'front',
        name: 'Mặt trước',
        displayOrder: 0,
        imageWidthPx: 1000,
        imageHeightPx: 1000,
        physicalWidthMm: 200,
        physicalHeightMm: 200,
        pxPerMm: 5,
        backgroundAssetId: '01920000-0000-7000-8000-0000000000d1',
        retiredAt: null,
        supersededById: null,
        areas: [
          {
            id: EDITOR_AREA_ID,
            code: 'chest',
            name: 'Ngực trái',
            displayOrder: 0,
            boundXPx: 100,
            boundYPx: 100,
            boundWidthPx: 400,
            boundHeightPx: 300,
            maxWidthMm: 80,
            maxHeightMm: 60,
            retiredAt: null,
            supersededById: null,
          },
        ],
      },
    ],
    ...overrides,
  } as unknown as AdminProductPlacementResponse;
}

export function makeTextElement(overrides: Record<string, unknown> = {}): DesignElement {
  return {
    id: 'element-1',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 120,
      y: 120,
      width: 200,
      height: 48,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
    },
    text: 'Thêu tay',
    fontId: 'inter',
    fontSizePx: 32,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    fill: '#101010',
    ...overrides,
  } as unknown as DesignElement;
}

export function makeImageElement(overrides: Record<string, unknown> = {}): DesignElement {
  return {
    id: 'element-image',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 150,
      y: 150,
      width: 120,
      height: 120,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
    },
    assetId: '01920000-0000-7000-8000-0000000000f1',
    derivativeId: '01920000-0000-7000-8000-0000000000f2',
    intrinsicWidthPx: 240,
    intrinsicHeightPx: 240,
    ...overrides,
  } as unknown as DesignElement;
}

export function makeDocument(elements: DesignElement[] = [makeTextElement()]): DesignDocument {
  return {
    schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    placement: {
      productSideId: EDITOR_SIDE_ID,
      embroideryAreaId: EDITOR_AREA_ID,
      canvasWidthPx: 1000,
      canvasHeightPx: 1000,
      physicalWidthMm: 200,
      physicalHeightMm: 200,
      pxPerMm: 5,
    },
    elements,
  };
}

/** A scoped DRAFT that has never been saved: no version, no document. */
export function makeUnversionedDetail(
  overrides: Record<string, unknown> = {},
): AdminDesignTemplateDetailResponse {
  return {
    templateId: EDITOR_TEMPLATE_ID,
    name: 'Mẫu sen đỏ',
    slug: 'mau-sen-do',
    status: 'DRAFT',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    scope: EDITOR_SCOPE,
    ...overrides,
  } as unknown as AdminDesignTemplateDetailResponse;
}

/** A scoped DRAFT at version `n`, carrying its canonical document. */
export function makeVersionedDetail(
  version = 1,
  document: DesignDocument = makeDocument(),
  overrides: Record<string, unknown> = {},
): AdminDesignTemplateDetailResponse {
  return makeUnversionedDetail({
    currentVersion: {
      version,
      documentSchemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      createdAt: '2026-08-08T11:00:00.000Z',
    },
    document,
    ...overrides,
  });
}

export function detailEnvelope(detail: AdminDesignTemplateDetailResponse) {
  return {
    success: true,
    code: 'DESIGN_TEMPLATE_DETAIL_READ',
    message: 'ok',
    data: detail,
    meta: { requestId: 'req-e1', timestamp: '2026-08-09T00:00:00.000Z' },
  } as never;
}

export function placementEnvelope(placement: AdminProductPlacementResponse) {
  return {
    success: true,
    code: 'PRODUCT_PLACEMENT_READ',
    message: 'ok',
    data: placement,
    meta: { requestId: 'req-e2', timestamp: '2026-08-09T00:00:00.000Z' },
  } as never;
}
