/**
 * Fixtures for the `/truy-cap/don-hang` suite (`APP12-S03`).
 *
 * Every value is synthetic. The token comes from the APP4 secure-link fixture
 * rather than being redeclared, so the one test credential in this app has one
 * definition and the secrecy sweeps of every secure landing assert the absence
 * of the same string. No real bank account, no real customer contact and no
 * real token appears here or in the completion report.
 *
 * The bank values are deliberately unusable: the BIN `970000` is unassigned,
 * the account number is a repeating pattern, and the holder is marked `(DEMO)`
 * — the same synthetic set `APP12-D01` drew with, so a fixture can never be
 * mistaken for production configuration.
 *
 * ## The amounts are chosen so a derivation would be visible
 *
 * ```text
 * merchandiseSubtotal   1250000.00
 * feeAmount               35000.00
 * fullPaymentAmount     1285000.00   the obligation's own figure
 * ```
 *
 * They are the approved frame's own figures (`910:297`, `910:301`, `910:305`),
 * and they add up — deliberately, because that is the honest case and a screen
 * that summed them would pass a test built on figures that did not. The
 * **superseded** obligation below is what makes the derivation visible instead:
 * after a fee correction the successor's amount is *not* the sum of the two
 * rows the order projection still carries, so a screen that computed the total
 * would print the old figure while the server owed the new one.
 */
import {
  CustomerFullPaymentResponseFullPaymentStatus,
  CustomerFullPaymentResponseOrderStatus,
  FullPaymentAttemptResponseMethod,
  FullPaymentAttemptResponseStatus,
  ReadyMadeOrderAccessResponseStatus,
  ReadyMadeOrderAccessResponseTerminationReason,
  ReadyMadeOrderPaymentResponseStatus,
  TransferEvidenceItemResponseAssetStatus,
  TransferEvidenceItemResponseMediaType,
  type CustomerFullPaymentResponse,
  type FullPaymentAttemptResponse,
  type ReadyMadeOrderAccessResponse,
  type TransferEvidenceItemResponse,
  type TransferEvidenceListResponse,
} from '@embroidery/api-client';

export const ORDER_CODE = 'ORD-P4W8N2VC6K';
/** The `FL` suffix is what distinguishes it from the `DC` and `RM` memos. */
export const TRANSFER_REFERENCE = 'ORDP4W8N2VC6KFL';

export const MERCHANDISE_SUBTOTAL = '1250000.00';
export const SHIPPING_FEE = '35000.00';
export const FULL_PAYMENT_AMOUNT = '1285000.00';
/** Grouped, as `910:297` prints it. Asserted present on the payable screen. */
export const FULL_PAYMENT_DISPLAY = '1.285.000';

/**
 * The successor obligation after an operator corrects the shipping fee.
 *
 * `1250000 + 60000 = 1310000`, but the order projection in a test that
 * exercises §24 deliberately still carries the **old** fee row, so a screen
 * that summed the two rows would print `1.285.000` while the obligation owes
 * `1.310.000`. That gap is what makes "the total is read, never computed" an
 * executable claim.
 */
export const CORRECTED_FULL_AMOUNT = '1310000.00';
export const CORRECTED_FULL_DISPLAY = '1.310.000';

export const ATTEMPT_ID = '9c1f7a20-6b3d-4e58-8a71-2d4e6f8b0c15';
export const SUCCESSOR_ATTEMPT_ID = '9c1f7a20-6b3d-4e58-8a71-2d4e6f8b0c26';

export function makeOrder(
  overrides: Partial<ReadyMadeOrderAccessResponse> = {},
): ReadyMadeOrderAccessResponse {
  return {
    accessExpiresAt: '2026-09-02T14:40:00.000Z',
    currencyCode: 'VND',
    delivery: {
      addressLine: '12 Ngõ Demo',
      district: 'Quận Minh Hoạ',
      feeAmount: SHIPPING_FEE,
      province: 'Hà Nội',
      recipientName: 'Khách Minh Hoạ',
      recipientPhone: '0900000000',
      ward: 'Phường Mẫu',
    },
    item: {
      currencyCode: 'VND',
      lineTotalAmount: MERCHANDISE_SUBTOTAL,
      productName: 'Túi vải thêu tay',
      quantity: 2,
      sizeLabel: 'M',
      unitPriceAmount: '625000.00',
      variantLabel: 'Xanh rêu',
    },
    merchandiseSubtotal: MERCHANDISE_SUBTOTAL,
    orderCode: ORDER_CODE,
    payment: {
      payable: true,
      payableTotal: FULL_PAYMENT_AMOUNT,
      status: ReadyMadeOrderPaymentResponseStatus.PENDING,
    },
    paymentDeadline: '2026-09-02T12:00:00.000Z',
    placedAt: '2026-09-01T12:00:00.000Z',
    status: ReadyMadeOrderAccessResponseStatus.AWAITING_PAYMENT,
    ...overrides,
  };
}

/**
 * Before an operator prices delivery.
 *
 * `payment` and `delivery.feeAmount` are **absent**, not zero — the contract's
 * own distinction between *not priced yet* and *priced at nothing*, and the
 * reason `AWAITING_SHIPPING_FEE` can show no total without the screen deciding
 * to hide one.
 */
export function makeAwaitingFee(): ReadyMadeOrderAccessResponse {
  const order = makeOrder({
    status: ReadyMadeOrderAccessResponseStatus.AWAITING_SHIPPING_FEE,
  });
  // Destructured away rather than set to `undefined`. `exactOptionalPropertyTypes`
  // is on, and the distinction is the contract's own: the server **spreads**
  // these fields, so a missing key and an explicit `undefined` are different
  // wire shapes and the fixture must produce the one the server sends.
  const { delivery, payment: _payment, ...rest } = order;
  if (delivery === undefined) return rest;
  const { feeAmount: _fee, ...priced } = delivery;
  return { ...rest, delivery: priced };
}

/** A fulfilment state: an Admin verified receipt and the order moved on. */
export function makeFulfilment(
  status: ReadyMadeOrderAccessResponse['status'],
): ReadyMadeOrderAccessResponse {
  // No live reservation stands once the stock is committed, so the contract
  // stops publishing a deadline — and the screen must stop showing one.
  const { paymentDeadline: _deadline, ...rest } = makeOrder({
    status,
    payment: {
      payable: false,
      payableTotal: FULL_PAYMENT_AMOUNT,
      status: ReadyMadeOrderPaymentResponseStatus.SATISFIED,
    },
  });
  return rest;
}

/**
 * An ordinary cancellation: `CANCELLED` with **no** `terminationReason` key.
 *
 * The absence is the whole point. `APP12-B04-C1` spreads the field rather than
 * assigning it, so "not classified as an expiry" is a missing key and never a
 * null — which is what lets §29's two-way mapping be a pure read.
 */
export function makeCancelled(): ReadyMadeOrderAccessResponse {
  const { payment: _payment, paymentDeadline: _deadline, ...rest } = makeOrder();
  return { ...rest, status: ReadyMadeOrderAccessResponseStatus.CANCELLED };
}

/** The reservation lapsed: `CANCELLED` **plus** the machine-readable reason. */
export function makeExpired(): ReadyMadeOrderAccessResponse {
  return {
    ...makeCancelled(),
    terminationReason: ReadyMadeOrderAccessResponseTerminationReason.RESERVATION_EXPIRED,
  };
}

export function makeFullPayment(
  overrides: Partial<CustomerFullPaymentResponse> = {},
): CustomerFullPaymentResponse {
  return {
    accessExpiresAt: '2026-09-02T14:40:00.000Z',
    bankInstructions: {
      accountName: 'CONG TY TNHH NET THEU (DEMO)',
      accountNumber: '0000111122223',
      bankBin: '970000',
      bankDisplayName: 'NGAN HANG DEMO — MINH HOA',
      transferReference: TRANSFER_REFERENCE,
    },
    currencyCode: 'VND',
    fullPaymentAmount: FULL_PAYMENT_AMOUNT,
    fullPaymentStatus: CustomerFullPaymentResponseFullPaymentStatus.PENDING,
    orderCode: ORDER_CODE,
    orderStatus: CustomerFullPaymentResponseOrderStatus.AWAITING_PAYMENT,
    payable: true,
    ...overrides,
  };
}

/** The successor obligation a shipping-fee correction composed (§24). */
export function makeCorrectedFullPayment(): CustomerFullPaymentResponse {
  return makeFullPayment({ fullPaymentAmount: CORRECTED_FULL_AMOUNT });
}

export function makeAttempt(
  overrides: Partial<FullPaymentAttemptResponse> = {},
): FullPaymentAttemptResponse {
  return {
    amount: FULL_PAYMENT_AMOUNT,
    attemptId: ATTEMPT_ID,
    currencyCode: 'VND',
    method: FullPaymentAttemptResponseMethod.BANK_TRANSFER,
    replayed: false,
    status: FullPaymentAttemptResponseStatus.PENDING,
    transferReference: TRANSFER_REFERENCE,
    ...overrides,
  };
}

export function makeEvidenceItem(
  overrides: Partial<TransferEvidenceItemResponse> = {},
): TransferEvidenceItemResponse {
  return {
    assetStatus: TransferEvidenceItemResponseAssetStatus.INSPECTING,
    byteSize: 2_516_582,
    createdAt: '2026-09-01T14:36:00.000Z',
    evidenceId: '9c1f7a20-6b3d-4e58-8a71-2d4e6f8b0d31',
    mediaType: TransferEvidenceItemResponseMediaType['image/jpeg'],
    ...overrides,
  };
}

export function makeEvidenceList(
  evidence: TransferEvidenceItemResponse[] = [],
): TransferEvidenceListResponse {
  return { evidence };
}

/**
 * Points the jsdom window at `/truy-cap/don-hang` with the given fragment.
 *
 * jsdom refuses a cross-origin `history.replaceState`, so the pathname is set
 * through a same-origin replace first; the fragment is then appended exactly as
 * a real secure link would deliver it.
 */
export function navigateToOrderAccess(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap/don-hang${fragment}`);
}

/** A file the local guard accepts, so the assertion is about the request. */
export function makeImageFile(name = 'bien-lai.jpg', type = 'image/jpeg', size = 2_516_582): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
