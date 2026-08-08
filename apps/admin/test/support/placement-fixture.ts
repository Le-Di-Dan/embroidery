import type {
  AdminAssetDetailResponse,
  AdminAssetListResponse,
  AdminPlacementAreaResponse,
  AdminPlacementSideResponse,
  AdminProductPlacementResponse,
} from '@embroidery/api-client';

export const PLACEMENT_PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
export const SIDE_FRONT_ID = '01920000-0000-7000-8000-0000000000a1';
export const SIDE_BACK_ID = '01920000-0000-7000-8000-0000000000a2';
export const AREA_CHEST_ID = '01920000-0000-7000-8000-0000000000b1';
export const AREA_RETIRED_ID = '01920000-0000-7000-8000-0000000000b2';
export const BACKGROUND_ASSET_ID = '01920000-0000-7000-8000-0000000000c1';
export const PLACEMENT_TOKEN = '2026-08-01T10:00:00.000Z';

/**
 * An area shaped exactly like the B01 contract.
 *
 * The nullable members are written as the server really answers them — a real
 * `number` or a real `null` — even though the generated type widens them to
 * `{ [key: string]: unknown } | null`. Writing them the generated way would
 * make the tests agree with the contract defect instead of with the server, and
 * the normalization these fixtures exercise would never be proven.
 */
export function makeArea(overrides: Record<string, unknown> = {}): AdminPlacementAreaResponse {
  return {
    id: AREA_CHEST_ID,
    code: 'chest',
    name: 'Ngực trái',
    displayOrder: 0,
    boundXPx: 100,
    boundYPx: 120,
    boundWidthPx: 400,
    boundHeightPx: 300,
    maxWidthMm: 80,
    maxHeightMm: 60,
    retiredAt: null,
    supersededById: null,
    ...overrides,
  } as unknown as AdminPlacementAreaResponse;
}

export function makeSide(overrides: Record<string, unknown> = {}): AdminPlacementSideResponse {
  return {
    id: SIDE_FRONT_ID,
    code: 'front',
    name: 'Mặt trước',
    displayOrder: 0,
    backgroundAssetId: BACKGROUND_ASSET_ID,
    // 2000 px over 200 mm is exactly 10 px/mm on both axes, so the fixture is
    // scale-consistent by construction and a test that breaks the scale has to
    // do so deliberately.
    imageWidthPx: 2000,
    imageHeightPx: 1500,
    physicalWidthMm: 200,
    physicalHeightMm: 150,
    pxPerMm: 10,
    retiredAt: null,
    supersededById: null,
    areas: [makeArea()],
    ...overrides,
  };
}

/** A retired area — history that Admin must keep visible (`IMP-D041` PO-07). */
export function makeRetiredArea(): AdminPlacementAreaResponse {
  return makeArea({
    id: AREA_RETIRED_ID,
    code: 'sleeve-old',
    name: 'Tay áo (cũ)',
    displayOrder: 1,
    retiredAt: '2026-07-30T08:00:00.000Z',
  });
}

export function makePlacement(
  overrides: Partial<AdminProductPlacementResponse> = {},
): AdminProductPlacementResponse {
  return {
    productId: PLACEMENT_PRODUCT_ID,
    productStatus: 'DRAFT',
    updatedAt: PLACEMENT_TOKEN,
    sides: [makeSide({ areas: [makeArea(), makeRetiredArea()] })],
    ...overrides,
  };
}

/** The success envelope the generated operation resolves with. */
export function placementEnvelope(placement: AdminProductPlacementResponse) {
  return {
    success: true,
    code: 'PRODUCT_PLACEMENT_READ',
    message: 'ok',
    data: placement,
    meta: { requestId: 'req-1', timestamp: '2026-08-01T00:00:00.000Z' },
  } as never;
}

/** An asset the server would accept as a side background. */
export function makeBackgroundAsset(
  overrides: Partial<AdminAssetDetailResponse> = {},
): AdminAssetDetailResponse {
  return {
    assetId: BACKGROUND_ASSET_ID,
    byteSize: 204_800,
    checksum: 'a'.repeat(64),
    classification: 'PRODUCTION_SENSITIVE',
    createdAt: '2026-07-29T09:00:00.000Z',
    kind: 'CATALOG_MEDIA',
    mediaType: 'image/png',
    status: 'ACCEPTED',
    updatedAt: '2026-07-29T09:05:00.000Z',
    ...overrides,
  } as unknown as AdminAssetDetailResponse;
}

export function makeAssetPage(items: AdminAssetDetailResponse[]): AdminAssetListResponse {
  return { hasNext: false, items };
}

export function assetEnvelope(page: AdminAssetListResponse) {
  return {
    success: true,
    code: 'ASSET_LIST_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-2', timestamp: '2026-08-01T00:00:00.000Z' },
  } as never;
}

/**
 * Puts the jsdom window at a chosen width for `useViewportMode`.
 *
 * jsdom implements no `matchMedia` at all, so without this the hook takes its
 * "unknown viewport" path and every test would silently run as desktop —
 * including the ones asserting the mobile notice.
 */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const match = /min-width:\s*(\d+)px/.exec(query);
      const min = match === null ? 0 : Number(match[1]);
      return {
        matches: width >= min,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    },
  });
}
