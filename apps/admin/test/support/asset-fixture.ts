import type { AdminAssetDetailResponse, AdminAssetListResponse } from '@embroidery/api-client';

/**
 * Asset fixtures shaped exactly like the B01 contract — including the fields
 * the screen must never render (`checksum`, `classification`, `kind`), so a
 * leak of any of them is visible in the tests rather than invisible.
 */
export function makeAsset(
  overrides: Partial<AdminAssetDetailResponse> = {},
): AdminAssetDetailResponse {
  return {
    assetId: '01920000-0000-7000-8000-000000000001',
    byteSize: 2_516_582,
    checksum: 'f1e2d3c4b5a6978877665544332211000f1e2d3c4b5a69788776655443322110',
    classification: 'PRODUCTION_SENSITIVE',
    createdAt: '2026-07-27T14:35:00.000Z',
    kind: 'CATALOG_MEDIA',
    mediaType: 'image/png',
    status: 'ACCEPTED',
    updatedAt: '2026-07-27T14:36:00.000Z',
    ...overrides,
  };
}

export function makePage(items: AdminAssetDetailResponse[], next?: string): AdminAssetListResponse {
  return next === undefined
    ? { hasNext: false, items }
    : { hasNext: true, items, nextCursor: next };
}

/** A PNG `File` of an exact size, with no real bytes read anywhere. */
export function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
