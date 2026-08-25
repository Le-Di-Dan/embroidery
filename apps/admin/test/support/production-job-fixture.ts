/**
 * Production job detail fixtures shaped exactly like the `APP8-B03` detail and
 * `APP8-B04` transition contracts.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: a `PLANNED` job has no `startedAt`, `completedAt`,
 * `cancelledAt`, `cancelledReason` or `reworkedFromJobId` at all, and a job
 * created without machine parameters has no `productionParameters`. A fixture
 * that always supplied them would let the screen pass a test the real API could
 * never satisfy.
 *
 * There is deliberately no `skuCode`, no priority, no operator, no machine, no
 * attempt count and no artifact anywhere here, because
 * `AdminProductionJobDetailResponse` and its nested types publish none of them —
 * so a screen that rendered one would be caught by the type, not merely by a
 * reviewer.
 *
 * All values are synthetic UUIDs; no real order, customer or admin identifier
 * appears anywhere.
 */
import type {
  AdminProductionJobDetailResponse,
  AdminProductionReservationResponse,
  AdminProductionReservationSummaryResponse,
  AdminProductionSpecificationResponse,
  AdminProductionTransitionResponse,
  AdminProductionTransitionResultResponse,
} from '@embroidery/api-client';

export const DETAIL_JOB_ID = '019a0000-0000-7000-8000-000000006091';
export const DETAIL_ORDER_ID = '019a0000-0000-7000-8000-000000006081';
export const DETAIL_ORDER_CODE = 'ORD-7K3MPQ2XVD';
export const DETAIL_APPROVAL_ID = '019a0000-0000-7000-8000-000000006031';
export const DETAIL_SKU_ID = '019a0000-0000-7000-8000-000000007001';
export const DETAIL_SKU_STOCK_ID = '019a0000-0000-7000-8000-000000007011';
export const DETAIL_RESERVATION_ID = '019a0000-0000-7000-8000-000000007021';
export const DETAIL_ADMIN_ID = '7c190000-0000-7000-8000-000000008b41';

export function makeSpecification(
  overrides: Partial<AdminProductionSpecificationResponse> = {},
): AdminProductionSpecificationResponse {
  return {
    approvalSnapshotId: DETAIL_APPROVAL_ID,
    productName: 'Áo thun cotton — Tee',
    variantLabel: 'Đen / M',
    sideName: 'Mặt trước',
    areaName: 'Ngực trái',
    physicalWidthMm: '120.00',
    physicalHeightMm: '80.00',
    quantityTotal: 25,
    documentHash: 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
    productionParameters: 'Chỉ Madeira 40 · mật độ 4.5 · tốc độ 750 spm',
    ...overrides,
  };
}

/**
 * A customer-owned product's specification: `variantLabel` is **always** absent
 * (INV-13) and this job was created with no machine parameters recorded.
 *
 * The keys are omitted rather than set to `undefined`, because that is what the
 * server sends and because `exactOptionalPropertyTypes` refuses the difference —
 * which is the point: a screen must handle a missing key, not a present one
 * holding `undefined`.
 */
export function makeCustomerOwnedSpecification(): AdminProductionSpecificationResponse {
  return {
    approvalSnapshotId: DETAIL_APPROVAL_ID,
    productName: 'Áo khách tự mang — COP',
    sideName: 'Mặt lưng',
    areaName: 'Giữa lưng',
    physicalWidthMm: '200.00',
    physicalHeightMm: '140.00',
    quantityTotal: 12,
    documentHash: 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
  };
}

export function makeReservation(
  overrides: Partial<AdminProductionReservationResponse> = {},
): AdminProductionReservationResponse {
  return {
    reservationId: DETAIL_RESERVATION_ID,
    skuId: DETAIL_SKU_ID,
    skuStockId: DETAIL_SKU_STOCK_ID,
    quantity: 25,
    status: 'RESERVED',
    ...overrides,
  };
}

/** A Catalog-only order: one Catalog line, one live reservation standing for it. */
export function makeCatalogSummary(
  overrides: Partial<AdminProductionReservationSummaryResponse> = {},
): AdminProductionReservationSummaryResponse {
  return {
    required: true,
    catalogItemCount: 1,
    customerOwnedItemCount: 0,
    reservations: [makeReservation()],
    ...overrides,
  };
}

/** A customer-owned-only order: `required = false`, and no reservation exists. */
export function makeCustomerOwnedSummary(): AdminProductionReservationSummaryResponse {
  return { required: false, catalogItemCount: 0, customerOwnedItemCount: 1, reservations: [] };
}

/** A mixed order: one Catalog line with a real reservation, one COP line with none. */
export function makeMixedSummary(
  status: AdminProductionReservationResponse['status'] = 'CONSUMED',
): AdminProductionReservationSummaryResponse {
  return {
    required: true,
    catalogItemCount: 1,
    customerOwnedItemCount: 1,
    reservations: [makeReservation({ status })],
  };
}

export function makeTransition(
  overrides: Partial<AdminProductionTransitionResponse> = {},
): AdminProductionTransitionResponse {
  return {
    actorKind: 'ADMIN',
    adminId: DETAIL_ADMIN_ID,
    correlationId: 'req-app8-a03',
    fromStatus: 'PLANNED',
    toStatus: 'STARTED',
    occurredAt: '2026-08-25T02:42:00.000Z',
    ...overrides,
  };
}

/** A fresh `PLANNED` Catalog job: no milestone, and an empty history. */
export function makeJobDetail(
  overrides: Partial<AdminProductionJobDetailResponse> = {},
): AdminProductionJobDetailResponse {
  return {
    jobId: DETAIL_JOB_ID,
    orderId: DETAIL_ORDER_ID,
    orderCode: DETAIL_ORDER_CODE,
    approvalSnapshotId: DETAIL_APPROVAL_ID,
    status: 'PLANNED',
    createdAt: '2026-08-25T02:00:00.000Z',
    updatedAt: '2026-08-25T02:00:00.000Z',
    specification: makeSpecification(),
    reservationSummary: makeCatalogSummary(),
    transitions: [],
    ...overrides,
  };
}

export function makeTransitionResult(
  overrides: Partial<AdminProductionTransitionResultResponse> = {},
): AdminProductionTransitionResultResponse {
  return {
    jobId: DETAIL_JOB_ID,
    orderId: DETAIL_ORDER_ID,
    fromStatus: 'PLANNED',
    status: 'STARTED',
    orderStatus: 'IN_PRODUCTION',
    reservationIds: [DETAIL_RESERVATION_ID],
    ...overrides,
  };
}

/** The standard success envelope every Admin read and write arrives in. */
export function jobEnvelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app8-a03', timestamp: '2026-08-25T03:00:00.000Z' },
  } as never;
}
