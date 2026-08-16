/**
 * `APP5-B03` response fixtures for the `/truy-cap` request-status suites.
 *
 * Every value is synthetic. The internal moderation fields these tests assert
 * the *absence* of — the internal reason, the moderation note, the moderator's
 * identity, the transition history — are deliberately not modelled here even as
 * overrides: `CustomRequestStatusResponse` has no such property, so a test that
 * tried to plant one would not compile. That is the point. The proof that
 * internal data is unrenderable is the contract, and these fixtures are how it
 * is exercised rather than how it is asserted.
 *
 * ### Why the builders take a loose bag and cast once
 *
 * Every nullable field in the generated contract is typed
 * `{ [key: string]: unknown } | null` rather than `string | null` — the Orval
 * decorator defect the projection module documents — and the workspace runs
 * `exactOptionalPropertyTypes`. Writing a realistic `null` or a plain string
 * into one therefore needs a cast at every single field. One documented cast
 * per builder is the honest version of that: the fixture states the wire shape
 * the server actually sends, and the projection under test is the thing that
 * has to cope with it.
 */
import type {
  CatalogRequestSubjectResponse,
  CustomRequestStatusResponse,
  CustomerOwnedRequestSubjectResponse,
} from '@embroidery/api-client';

type WireOverrides = Readonly<Record<string, unknown>>;

export const TEST_REQUEST_CODE = 'REQ-7KM2QD4XVA';

/** `2026-08-16T03:24:00Z` is `16/08/2026 · 10:24` in `Asia/Ho_Chi_Minh`. */
export const TEST_SUBMITTED_AT = '2026-08-16T03:24:00.000Z';

/** `2026-08-23T02:00:00Z` is `23/08/2026` in `Asia/Ho_Chi_Minh`. */
export const TEST_ACCESS_EXPIRES_AT = '2026-08-23T02:00:00.000Z';

export const TEST_REQUEST_ID = '2f1c9d64-0f2a-4d1f-9a3e-7c5b8e0d1a22';
export const TEST_PRODUCT_ID = '4f9a1c02-7d61-4a3b-9e18-2b7c5d0e6a31';
export const TEST_PRODUCT_VARIANT_ID = '9c2e4b71-33a0-4f52-8d16-5a7e9b04c8f2';
export const TEST_PRODUCT_SLUG = 'ao-thun-cotton';
export const TEST_ASSET_IDS = [
  'a1b2c3d4-0000-4000-8000-000000000001',
  'a1b2c3d4-0000-4000-8000-000000000002',
] as const;

export function customerOwnedSubject(
  overrides: WireOverrides = {},
): CustomerOwnedRequestSubjectResponse {
  return {
    kind: 'CUSTOMER_OWNED',
    name: 'Áo khoác denim của tôi',
    description: null,
    physicalWidthMm: '120.00',
    physicalHeightMm: '80.00',
    ...overrides,
  } as unknown as CustomerOwnedRequestSubjectResponse;
}

export function catalogSubject(overrides: WireOverrides = {}): CatalogRequestSubjectResponse {
  return {
    kind: 'CATALOG',
    productId: TEST_PRODUCT_ID,
    productName: 'Áo thun cotton',
    productSlug: TEST_PRODUCT_SLUG,
    productVariantId: TEST_PRODUCT_VARIANT_ID,
    variantColorName: 'Xanh rêu',
    variantSizeLabel: 'L',
    ...overrides,
  } as unknown as CatalogRequestSubjectResponse;
}

/** A whole B03 projection, as the wire actually carries it. */
export function makeStatusResponse(overrides: WireOverrides = {}): CustomRequestStatusResponse {
  return {
    requestId: TEST_REQUEST_ID,
    code: TEST_REQUEST_CODE,
    status: 'NEW',
    submittedAt: TEST_SUBMITTED_AT,
    accessExpiresAt: TEST_ACCESS_EXPIRES_AT,
    subject: customerOwnedSubject(),
    quantities: [{ quantity: 1, sizeLabel: 'L', productVariantId: null }],
    totalQuantity: 1,
    assets: [
      { assetId: TEST_ASSET_IDS[0], role: 'COP_IMAGE' },
      { assetId: TEST_ASSET_IDS[1], role: 'REFERENCE' },
    ],
    customerVisibleReason: null,
    ...overrides,
  } as unknown as CustomRequestStatusResponse;
}

/** The workshop's customer-facing message, as B03 publishes it. */
export function withReason(status: string, reason: string | null): CustomRequestStatusResponse {
  return makeStatusResponse({ status, customerVisibleReason: reason });
}
