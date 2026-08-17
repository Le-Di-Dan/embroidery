/**
 * Detail fixtures shaped exactly like the `APP5-B04` contract.
 *
 * The optional fields are **omitted by default**, not blanked: `APP5-B04`
 * reports a catalog product whose labels no longer resolve, a customer who gave
 * no name and a tombstoned asset as *absent*. A fixture that always supplied
 * them would let the screen pass tests the real API could never satisfy — which
 * is exactly the class of bug the missing-label copy exists for.
 *
 * `transitions` and `moderationNotes` default to empty. Submission writes no
 * transition row (`G01-D05`), so an unmoderated request genuinely has no
 * history, and the fixture must not invent the creation entry the screen is
 * forbidden to render.
 */
import type {
  AdminCustomRequestDetailResponse,
  AdminRequestAssetResponse,
  AdminRequestModerationNoteResponse,
  AdminRequestTransitionResponse,
} from '@embroidery/api-client';

export const DETAIL_REQUEST_ID = '01940000-0000-7000-8000-0000000000d1';
export const DETAIL_CUSTOMER_ID = '01930000-0000-7000-8000-0000000000c1';
export const COP_ASSET_ID = '01940000-0000-7000-8000-0000000000a1';
export const REFERENCE_ASSET_ID = '01940000-0000-7000-8000-0000000000a2';

export function makeAsset(overrides: Record<string, unknown> = {}): AdminRequestAssetResponse {
  return {
    assetId: COP_ASSET_ID,
    role: 'COP_IMAGE',
    linkedAt: '2026-08-14T02:31:00.000Z',
    mimeType: 'image/jpeg',
    sizeBytes: '204800',
    status: 'ACCEPTED',
    ...overrides,
  } as unknown as AdminRequestAssetResponse;
}

export function makeTransition(
  overrides: Record<string, unknown> = {},
): AdminRequestTransitionResponse {
  return {
    sequence: 1,
    fromStatus: 'NEW',
    toStatus: 'UNDER_REVIEW',
    actorKind: 'ADMIN',
    actorAdminId: '01930000-0000-7000-8000-00000000ad01',
    occurredAt: '2026-08-15T03:00:00.000Z',
    ...overrides,
  } as unknown as AdminRequestTransitionResponse;
}

export function makeNote(
  overrides: Record<string, unknown> = {},
): AdminRequestModerationNoteResponse {
  return {
    sequence: 1,
    kind: 'NOTE',
    note: 'Khách gửi ảnh hơi mờ.',
    adminId: '01930000-0000-7000-8000-00000000ad01',
    createdAt: '2026-08-15T03:05:00.000Z',
    ...overrides,
  } as unknown as AdminRequestModerationNoteResponse;
}

/** A Catalog request. The subject discriminator is always present. */
export function makeCatalogDetail(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return {
    requestId: DETAIL_REQUEST_ID,
    code: 'REQ-2026-000123',
    status: 'NEW',
    submittedAt: '2026-08-14T02:30:00.000Z',
    updatedAt: '2026-08-14T02:30:00.000Z',
    customerNote: 'Thêu tên bé lên ngực áo.',
    customer: {
      customerId: DETAIL_CUSTOMER_ID,
      displayName: 'Chị Lan',
      verifiedAt: '2026-07-01T00:00:00.000Z',
      contacts: [{ kind: 'EMAIL', maskedValue: 'l***@example.com', primary: true, verified: true }],
    },
    subject: {
      kind: 'CATALOG',
      productId: '01940000-0000-7000-8000-0000000000p1',
      productName: 'Áo thun cotton',
      productSlug: 'ao-thun-cotton',
      productVariantId: '01940000-0000-7000-8000-0000000000v1',
      variantColorName: 'Xanh rêu',
      variantSizeLabel: 'M',
      designSessionId: '01940000-0000-7000-8000-0000000000s1',
    },
    quantities: [
      { productVariantId: '01940000-0000-7000-8000-0000000000v1', quantity: 12, sizeLabel: 'M' },
    ],
    totalQuantity: 12,
    assets: [],
    transitions: [],
    moderationNotes: [],
    ...overrides,
  } as unknown as AdminCustomRequestDetailResponse;
}

/** A customer-owned request: no design session, dimensions instead of a variant. */
export function makeCopDetail(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return makeCatalogDetail({
    subject: {
      kind: 'CUSTOMER_OWNED',
      name: 'Áo khoác jean của khách',
      description: 'Thêu logo sau lưng.',
      physicalWidthMm: '300.00',
      physicalHeightMm: '250.00',
    },
    quantities: [{ quantity: 1 }],
    totalQuantity: 1,
    assets: [makeAsset()],
    ...overrides,
  });
}

export function detailEnvelope(detail: AdminCustomRequestDetailResponse) {
  return {
    success: true,
    code: 'CUSTOM_REQUEST_DETAIL_READ',
    message: 'ok',
    data: detail,
    meta: { requestId: 'req-1', timestamp: '2026-08-17T00:00:00.000Z' },
  } as never;
}

export function mutationEnvelope() {
  return {
    success: true,
    code: 'CUSTOM_REQUEST_MODERATED',
    message: 'ok',
    data: {},
    meta: { requestId: 'req-2', timestamp: '2026-08-17T00:00:00.000Z' },
  } as never;
}
