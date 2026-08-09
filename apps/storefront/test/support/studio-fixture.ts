import type {
  ApiSuccessResponse,
  DesignSessionSnapshotResponse,
  PublicDesignTemplateDetailResponse,
  PublicDesignTemplateListResponse,
  PublicDesignTemplateSummaryResponse,
  PublicPlacementAreaResponse,
  PublicPlacementSideResponse,
  PublicProductPlacementResponse,
  TransportDesignDocument,
} from '@embroidery/api-client';

/**
 * Fixtures for the Studio bootstrap tests (`APP3-S01`).
 *
 * Shapes are built from the generated types rather than hand-typed object
 * literals, so a contract change breaks these at compile time instead of
 * letting a test keep passing against a wire shape that no longer exists.
 */

export const PRODUCT_SLUG = 'gau-bong-theu-tay';
export const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

export function envelopeOf<T>(data: T): ApiSuccessResponse & { data: T } {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'req-test', timestamp: '2026-08-09T00:00:00.000Z' },
  };
}

export function makeArea(
  overrides: Partial<PublicPlacementAreaResponse> = {},
): PublicPlacementAreaResponse {
  return {
    id: 'area-1',
    code: 'nguc-trai',
    name: 'Ngực trái',
    displayOrder: 1,
    boundXPx: 100,
    boundYPx: 120,
    boundWidthPx: 200,
    boundHeightPx: 160,
    maxWidthMm: null,
    maxHeightMm: null,
    ...overrides,
  };
}

export function makeSide(
  overrides: Partial<PublicPlacementSideResponse> = {},
): PublicPlacementSideResponse {
  return {
    id: 'side-1',
    code: 'mat-truoc',
    name: 'Mặt trước',
    displayOrder: 1,
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    physicalWidthMm: 250,
    physicalHeightMm: 250,
    pxPerMm: 4,
    background: {
      productSlug: PRODUCT_SLUG,
      sideCode: overrides.code ?? 'mat-truoc',
      delivery: null,
    },
    areas: [makeArea()],
    ...overrides,
  };
}

export function makePlacement(
  overrides: Partial<PublicProductPlacementResponse> = {},
): PublicProductPlacementResponse {
  return {
    slug: PRODUCT_SLUG,
    productId: PRODUCT_ID,
    studioEligible: true,
    sides: [makeSide()],
    ...overrides,
  };
}

export function makeTemplate(
  overrides: Partial<PublicDesignTemplateSummaryResponse> = {},
): PublicDesignTemplateSummaryResponse {
  return {
    slug: 'hoa-sen',
    name: 'Hoa sen',
    publishedVersion: {
      version: 2,
      documentSchemaVersion: 1,
      publishedAt: '2026-08-01T00:00:00.000Z',
    },
    scope: {
      productId: PRODUCT_ID,
      productSideId: 'side-1',
      embroideryAreaId: 'area-1',
    },
    ...overrides,
  };
}

export function makeTemplatePage(
  items: readonly PublicDesignTemplateSummaryResponse[],
  nextCursor?: string,
): PublicDesignTemplateListResponse {
  return {
    items: [...items],
    hasNext: nextCursor !== undefined,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

/** A document placing one image, which is what makes a preview requestable. */
export function makeDocument(assetIds: readonly string[] = []): TransportDesignDocument {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: 'side-1',
      embroideryAreaId: 'area-1',
      canvasWidthPx: 1000,
      canvasHeightPx: 1000,
      physicalWidthMm: 250,
      physicalHeightMm: 250,
      pxPerMm: 4,
    },
    elements: assetIds.map((assetId, index) => ({
      type: 'image',
      id: `el-${String(index)}`,
      assetId,
      derivativeId: `der-${String(index)}`,
      intrinsicWidthPx: 400,
      intrinsicHeightPx: 400,
      opacity: 1,
      locked: false,
      visible: true,
      transform: { x: 0, y: 0, width: 400, height: 400, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    })),
  };
}

export function makeTemplateDetail(
  overrides: Partial<PublicDesignTemplateDetailResponse> = {},
): PublicDesignTemplateDetailResponse {
  const summary = makeTemplate();
  return {
    slug: summary.slug,
    name: summary.name,
    scope: summary.scope,
    publishedVersion: summary.publishedVersion,
    document: makeDocument(['asset-1']),
    ...overrides,
  };
}

export function makeSnapshot(
  overrides: Partial<DesignSessionSnapshotResponse> = {},
): DesignSessionSnapshotResponse {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    status: 'ACTIVE',
    revision: 0,
    expiresAt: '2026-09-08T00:00:00.000Z',
    documentSchemaVersion: 1,
    document: makeDocument(),
    ...overrides,
  };
}

/** An error shaped the way `normalizeApiClientError` reads an Axios failure. */
export function apiFailure(status: number): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: { status, data: {} },
    toJSON: () => ({}),
  };
}
