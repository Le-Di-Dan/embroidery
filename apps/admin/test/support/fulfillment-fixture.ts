/**
 * APP9 fulfillment fixtures, shaped exactly like the `APP9-B01`, `APP9-B04` and
 * `APP9-B05` contracts.
 *
 * A file of its own beside `order-fixture.ts` rather than an addition to it: the
 * APP7 deposit fixtures and the APP9 fulfillment ones describe different
 * capabilities, and the order fixture is already the shared base both build on.
 *
 * ## The nullable members are fixtured as they are *typed*, not as they read
 *
 * `feeAmount`, `carrierName`, `trackingCode`, `ward`, `district` and `frozenAt`
 * are declared `{ [key: string]: unknown } | null` by the generated client,
 * because the committed OpenAPI artifact says `nullable: true, type: "object"`
 * for members the server actually sends as strings (`FU-APP9-A01-01`). The
 * fixtures send the **string** the server sends, cast at this seam only, so the
 * code under test faces exactly the wire shape a real response has — a fixture
 * that sent an object would let the screen pass a test the real API could never
 * satisfy.
 *
 * The double assertion below is what that costs. `as AdminShippingDetailResponse`
 * alone is rejected, and TypeScript is right to reject it: `string` and
 * `{ [key: string]: unknown } | null` genuinely do not overlap. So the fixture
 * goes through `unknown`, deliberately and in this file only — the production
 * narrowing in `shipping-detail-form.ts` uses a real `typeof` check and no cast
 * at all.
 *
 * ## Optional members are omitted by default
 *
 * `frozenAt` is absent while a detail is editable, and a detail saved before a
 * fee was set carries no `feeAmount`. Supplying them unconditionally would hide
 * exactly the empty-field handling the editor exists to get right.
 *
 * All values are synthetic: the recipient, phone, address, carrier and tracking
 * code follow the `APP9-D01` non-production set, and no real customer contact,
 * account, token or storage identifier appears anywhere.
 */
import type {
  AdminOrderCompletionResponse,
  AdminOrderDispatchResponse,
  AdminOrderTransitionResultResponse,
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
} from '@embroidery/api-client';

import { ORDER_CODE, ORDER_ID } from './order-fixture';

export const REMAINING_OBLIGATION_ID = '019e0000-0000-7000-8000-0000000000b1';
export const STORED_FEE = '45000.00';
export const INCREASED_FEE = '95000.00';
export const FROZEN_AT = '2026-08-27T07:26:00.000Z';

/** A complete, still-editable shipping detail. */
export function makeShippingDetail(
  overrides: Record<string, unknown> = {},
): AdminShippingDetailResponse {
  return {
    recipientName: 'Nguyễn Thị Mai Hoa',
    recipientPhone: '0909111222',
    addressLine: '118 Nguyễn Văn Cừ',
    ward: 'Phường An Khê',
    district: 'Quận Thanh Khê',
    province: 'Đà Nẵng',
    countryCode: 'VN',
    feeAmount: STORED_FEE,
    carrierName: 'Giao Hàng Nhanh',
    trackingCode: 'GHN-8842197305',
    status: 'EDITABLE',
    ...overrides,
  } as unknown as AdminShippingDetailResponse;
}

/** The same detail after dispatch froze it. */
export function makeFrozenShippingDetail(
  overrides: Record<string, unknown> = {},
): AdminShippingDetailResponse {
  return makeShippingDetail({ status: 'FROZEN', frozenAt: FROZEN_AT, ...overrides });
}

export function makeShippingSaved(
  overrides: Record<string, unknown> = {},
): AdminShippingDetailSavedResponse {
  return {
    orderId: ORDER_ID,
    detail: makeShippingDetail(),
    fee: { changed: false, previousFeeAmount: STORED_FEE, acknowledged: false },
    ...overrides,
  };
}

/**
 * The `TR-LC14-05` receipt.
 *
 * `remainingObligationStatus` is `PENDING` and the obligation id is one that
 * already existed: the command opens the window, it does not create, recalculate
 * or satisfy anything.
 */
export function makeTransitionResult(
  overrides: Record<string, unknown> = {},
): AdminOrderTransitionResultResponse {
  return {
    orderId: ORDER_ID,
    code: ORDER_CODE,
    fromStatus: 'PRODUCTION_COMPLETED',
    status: 'AWAITING_FINAL_PAYMENT',
    remainingObligationId: REMAINING_OBLIGATION_ID,
    remainingObligationStatus: 'PENDING',
    ...overrides,
  };
}

export function makeDispatchResult(
  overrides: Record<string, unknown> = {},
): AdminOrderDispatchResponse {
  return {
    orderId: ORDER_ID,
    code: ORDER_CODE,
    fromStatus: 'READY_FOR_DELIVERY',
    status: 'DELIVERED',
    dispatchedAt: FROZEN_AT,
    shippingStatus: 'FROZEN',
    frozenAt: FROZEN_AT,
    ...overrides,
  };
}

export function makeCompletionResult(
  overrides: Record<string, unknown> = {},
): AdminOrderCompletionResponse {
  return {
    orderId: ORDER_ID,
    code: ORDER_CODE,
    fromStatus: 'DELIVERED',
    status: 'COMPLETED',
    ...overrides,
  };
}

/**
 * A refusal exactly as the platform envelope carries one, wrapped the way Axios
 * hands it to the generated client.
 *
 * The `code` is what the screen classifies on; the `message` is deliberately
 * English server text, so a test proves the screen never renders it.
 */
export function apiRefusal(status: number, code: string) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: {
        success: false,
        code,
        message: 'A server sentence that must never reach the operator.',
        meta: { requestId: 'req-app9-a01', timestamp: FROZEN_AT },
      },
    },
  };
}
