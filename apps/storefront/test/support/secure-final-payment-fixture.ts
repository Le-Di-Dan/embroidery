/**
 * Fixtures for the `/truy-cap/thanh-toan-con-lai` suite (`APP9-S01`).
 *
 * Every value is synthetic. The token comes from the APP4 secure-link fixture
 * rather than being redeclared, so the one test credential in this app has one
 * definition and the secrecy sweeps of every secure landing assert the absence
 * of the same string. No real bank account, no real customer contact and no real
 * token appears here or in the completion report.
 *
 * The bank values are deliberately unusable: the BIN `970000` is unassigned, the
 * account number is a repeating pattern, and the holder is marked `(DEMO)` — the
 * same synthetic set `APP9-D01` drew with, so a fixture can never be mistaken
 * for production configuration.
 *
 * ## The amount is chosen so a derivation would be visible
 *
 * `7650000.00` is the `REMAINING` obligation's own frozen figure. There is
 * deliberately **no order total and no deposit amount in this file**, because
 * `CustomerFinalPaymentResponse` publishes neither — so a screen that tried to
 * derive the balance as *total − deposit* would have nothing to derive it from
 * and would have to invent one. `DERIVED_TOTAL` and `DERIVED_DEPOSIT` exist for
 * exactly one purpose: to be asserted **absent** from the rendered page.
 */
import {
  CustomerFinalPaymentResponseFinalPaymentStatus,
  CustomerFinalPaymentResponseOrderStatus,
  FinalPaymentAttemptResponseMethod,
  FinalPaymentAttemptResponseStatus,
  TransferEvidenceItemResponseAssetStatus,
  TransferEvidenceItemResponseMediaType,
  type CustomerFinalPaymentResponse,
  type FinalPaymentAttemptResponse,
  type TransferEvidenceItemResponse,
  type TransferEvidenceListResponse,
} from '@embroidery/api-client';

export const ORDER_CODE = 'ORD-K7M2Q9XR4T';
/** The `RM` suffix is what distinguishes it from the deposit memo on this order. */
export const TRANSFER_REFERENCE = 'ORDK7M2Q9XR4TRM';
export const FINAL_PAYMENT_AMOUNT = '7650000.00';
export const ACCOUNT_NUMBER = '0000111122223';
export const ATTEMPT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';

/**
 * The two figures the approved frames print and the contract does not carry.
 *
 * Never returned by any mock. They exist so a test can assert that neither the
 * grouped nor the raw form appears anywhere in the document — which is what
 * makes "the balance is not derived" an executable claim rather than a comment.
 */
export const DERIVED_TOTAL = '12.750.000';
export const DERIVED_DEPOSIT = '5.100.000';

export function makeFinalPayment(
  overrides: Partial<CustomerFinalPaymentResponse> = {},
): CustomerFinalPaymentResponse {
  return {
    accessExpiresAt: '2026-09-01T09:14:00.000Z',
    bankInstructions: {
      accountName: 'CONG TY TNHH NET THEU (DEMO)',
      accountNumber: ACCOUNT_NUMBER,
      bankBin: '970000',
      bankDisplayName: 'NGAN HANG DEMO — MINH HOA',
      transferReference: TRANSFER_REFERENCE,
    },
    currencyCode: 'VND',
    finalPaymentAmount: FINAL_PAYMENT_AMOUNT,
    finalPaymentStatus: CustomerFinalPaymentResponseFinalPaymentStatus.PENDING,
    orderCode: ORDER_CODE,
    orderStatus: CustomerFinalPaymentResponseOrderStatus.AWAITING_FINAL_PAYMENT,
    payable: true,
    ...overrides,
  };
}

/**
 * The balance before `TR-LC14-05`: real, truthful, and not collectable.
 *
 * The amount is still the obligation's own — the read answers honestly in every
 * state — which is precisely why the not-payable screen must be asserted to show
 * no figure at all.
 */
export function makeNotPayable(): CustomerFinalPaymentResponse {
  return makeFinalPayment({
    orderStatus: CustomerFinalPaymentResponseOrderStatus.IN_PRODUCTION,
    payable: false,
  });
}

/** After an Admin verified the balance: both authoritative fields moved. */
export function makeSettled(
  orderStatus: CustomerFinalPaymentResponse['orderStatus'] = CustomerFinalPaymentResponseOrderStatus.READY_FOR_DELIVERY,
): CustomerFinalPaymentResponse {
  return makeFinalPayment({
    finalPaymentStatus: CustomerFinalPaymentResponseFinalPaymentStatus.SATISFIED,
    orderStatus,
    payable: false,
  });
}

export function makeAttempt(
  overrides: Partial<FinalPaymentAttemptResponse> = {},
): FinalPaymentAttemptResponse {
  return {
    amount: FINAL_PAYMENT_AMOUNT,
    attemptId: ATTEMPT_ID,
    currencyCode: 'VND',
    method: FinalPaymentAttemptResponseMethod.BANK_TRANSFER,
    replayed: false,
    status: FinalPaymentAttemptResponseStatus.PENDING,
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
    createdAt: '2026-08-27T09:36:00.000Z',
    evidenceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3501',
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
 * Points the jsdom window at `/truy-cap/thanh-toan-con-lai` with the given
 * fragment.
 *
 * jsdom refuses a cross-origin `history.replaceState`, so the pathname is set
 * through a same-origin replace first; the fragment is then appended exactly as
 * a real secure link would deliver it.
 */
export function navigateToFinalPayment(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap/thanh-toan-con-lai${fragment}`);
}

/** A file the local guard accepts, so the assertion is about the request. */
export function makeImageFile(name = 'bien-lai.jpg', type = 'image/jpeg', size = 2_516_582): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
