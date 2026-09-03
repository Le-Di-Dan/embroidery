/**
 * Order and payment fixtures shaped exactly like the `APP7-B02`, `APP7-B04` and
 * `APP7-B06` contracts.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: `sizeLabel` is absent on every line the contract
 * currently produces, `variantLabel` is absent on customer-owned lines,
 * `reviewReason` is absent unless an attempt is under review, and a
 * reconciliation's `amount`, `bankReference`, `paymentAttemptId` and
 * `resolvedStatus` are all optional. A fixture that always supplied them would
 * let the screen pass a test the real API could never satisfy — which is exactly
 * the defect the size column exists to avoid.
 *
 * Every amount is a decimal **string**, as the contract transports it. Nothing
 * in these fixtures or in the code under test converts one to a number.
 *
 * All values are synthetic: the order codes, references and amounts follow the
 * `APP7-D01` non-production set, and no real bank account, customer contact,
 * admin account or storage identifier appears anywhere.
 */
import type {
  AdminOrderDetailResponse,
  AdminOrderItemResponse,
  AdminOrderPaymentsResponse,
  AdminOrderQueueItemResponse,
  AdminOrderQueueResponse,
  AdminPaymentAttemptResponse,
  AdminPaymentEvidenceResponse,
  AdminPaymentReconciliationResponse,
  PaymentDecisionResponse,
} from '@embroidery/api-client';

export const ORDER_ID = '01950000-0000-7000-8000-000000000001';
export const ORDER_ID_PAID = '01950000-0000-7000-8000-000000000002';
export const CUSTOMER_ID = '01930000-0000-7000-8000-0000000000c1';
export const REQUEST_ID = '01940000-0000-7000-8000-000000000001';
export const ATTEMPT_ID = '01960000-0000-7000-8000-00000000000a';
export const EVIDENCE_ACCEPTED_ID = '01970000-0000-7000-8000-0000000000e1';
export const EVIDENCE_INSPECTING_ID = '01970000-0000-7000-8000-0000000000e2';
export const EVIDENCE_REJECTED_ID = '01970000-0000-7000-8000-0000000000e3';

export const ORDER_CODE = 'ORD-K7M2Q9XR4T';
export const EXPECTED_REFERENCE = 'ORDK7M2Q9XR4TDC';
export const EXPECTED_AMOUNT = '5100000.00';

export function makeQueueItem(
  overrides: Record<string, unknown> = {},
): AdminOrderQueueItemResponse {
  return {
    orderId: ORDER_ID,
    code: ORDER_CODE,
    status: 'AWAITING_DEPOSIT',
    origin: 'CUSTOM',
    totalAmount: '12750000.00',
    currencyCode: 'VND',
    createdAt: '2026-08-23T02:14:00.000Z',
    customRequestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    ...overrides,
  };
}

export function makeQueuePage(
  items: AdminOrderQueueItemResponse[],
  options: { next?: string } = {},
): AdminOrderQueueResponse {
  const { next } = options;
  return {
    items,
    ...(next === undefined ? { hasNext: false } : { hasNext: true, nextCursor: next }),
  };
}

/** A frozen catalog line. `sizeLabel` is absent, exactly as B02 sends it. */
export function makeCatalogItem(overrides: Record<string, unknown> = {}): AdminOrderItemResponse {
  return {
    position: 1,
    productName: 'Áo thun cotton premium',
    subjectKind: 'CATALOG',
    skuId: '01980000-0000-7000-8000-0000000003f0',
    variantLabel: 'Trắng / M',
    quantity: 3,
    unitPriceAmount: '2150000.00',
    lineTotalAmount: '6450000.00',
    currencyCode: 'VND',
    approvalSnapshotId: '01990000-0000-7000-8000-00000000044d',
    ...overrides,
  };
}

/** A customer-owned line: no SKU, no variant, and never given a fabricated one. */
export function makeCustomerOwnedItem(
  overrides: Record<string, unknown> = {},
): AdminOrderItemResponse {
  return {
    position: 2,
    productName: 'Áo khoác khách gửi',
    subjectKind: 'CUSTOMER_OWNED',
    customerOwnedProductId: '01980000-0000-7000-8000-0000000005c0',
    quantity: 2,
    unitPriceAmount: '3150000.00',
    lineTotalAmount: '6300000.00',
    currencyCode: 'VND',
    approvalSnapshotId: '01990000-0000-7000-8000-00000000044d',
    ...overrides,
  };
}

export function makeOrderDetail(overrides: Record<string, unknown> = {}): AdminOrderDetailResponse {
  return {
    orderId: ORDER_ID,
    code: ORDER_CODE,
    status: 'AWAITING_DEPOSIT',
    origin: 'CUSTOM',
    totalAmount: '12750000.00',
    currencyCode: 'VND',
    createdAt: '2026-08-23T02:14:00.000Z',
    updatedAt: '2026-08-23T02:14:00.000Z',
    customRequestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    acceptedQuotationVersionId: '019a0000-0000-7000-8000-000000000a91',
    currentApprovalSnapshotId: '01990000-0000-7000-8000-00000000044d',
    items: [makeCatalogItem(), makeCustomerOwnedItem()],
    ...overrides,
  };
}

export function makeEvidence(
  overrides: Record<string, unknown> = {},
): AdminPaymentEvidenceResponse {
  return {
    evidenceId: EVIDENCE_ACCEPTED_ID,
    assetStatus: 'ACCEPTED',
    previewEligible: true,
    mediaType: 'image/jpeg',
    byteSize: 2_516_582,
    createdAt: '2026-08-23T02:34:00.000Z',
    ...overrides,
  };
}

export function makeAttempt(overrides: Record<string, unknown> = {}): AdminPaymentAttemptResponse {
  return {
    attemptId: ATTEMPT_ID,
    status: 'PENDING',
    method: 'BANK_TRANSFER',
    amount: EXPECTED_AMOUNT,
    currencyCode: 'VND',
    createdAt: '2026-08-23T02:21:00.000Z',
    updatedAt: '2026-08-23T02:21:00.000Z',
    evidence: [],
    ...overrides,
  };
}

export function makeReconciliation(
  overrides: Record<string, unknown> = {},
): AdminPaymentReconciliationResponse {
  return {
    reconciliationId: '019b0000-0000-7000-8000-000000000001',
    action: 'MANUAL_MATCH',
    adminId: '019c0000-0000-7000-8000-0000000a41f0',
    reason: 'Số tiền thực nhận lệch so với kỳ vọng.',
    createdAt: '2026-08-23T03:12:00.000Z',
    ...overrides,
  };
}

export function makePayments(overrides: Record<string, unknown> = {}): AdminOrderPaymentsResponse {
  return {
    orderId: ORDER_ID,
    orderCode: ORDER_CODE,
    orderStatus: 'AWAITING_DEPOSIT',
    origin: 'CUSTOM',
    currentObligation: {
      obligationId: '019d0000-0000-7000-8000-000000000001',
      kind: 'DEPOSIT',
      status: 'PENDING',
      expectedAmount: EXPECTED_AMOUNT,
      expectedCurrencyCode: 'VND',
      expectedTransferReference: EXPECTED_REFERENCE,
    },
    attempts: [makeAttempt()],
    reconciliations: [],
    ...overrides,
  };
}

/** The exact-match verification result: all three facts together. */
export function makeVerifiedDecision(
  overrides: Record<string, unknown> = {},
): PaymentDecisionResponse {
  return {
    attemptId: ATTEMPT_ID,
    attemptStatus: 'SUCCEEDED',
    depositObligationId: '019d0000-0000-7000-8000-000000000001',
    depositStatus: 'SATISFIED',
    orderId: ORDER_ID,
    orderStatus: 'DEPOSIT_PAID',
    reconciliationAction: 'MANUAL_MATCH',
    replayed: false,
    ...overrides,
  };
}

/** The mismatch result. Still HTTP 200; nothing is satisfied and nothing moves. */
export function makeReviewDecision(
  overrides: Record<string, unknown> = {},
): PaymentDecisionResponse {
  return {
    ...makeVerifiedDecision(),
    attemptStatus: 'REQUIRES_REVIEW',
    depositStatus: 'PENDING',
    orderStatus: 'AWAITING_DEPOSIT',
    ...overrides,
  };
}

/** The standard success envelope every Admin read and decision arrives in. */
export function envelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app7-a01', timestamp: '2026-08-23T03:00:00.000Z' },
  } as never;
}
