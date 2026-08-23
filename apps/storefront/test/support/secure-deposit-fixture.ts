/**
 * Fixtures for the `/truy-cap/thanh-toan` suites (`APP7-S01`).
 *
 * Every value is synthetic. The token comes from the APP4 secure-link fixture
 * rather than being redeclared, so the one test credential in this app has one
 * definition and the secrecy sweeps of every secure landing assert the absence
 * of the same string. No real bank account, no real customer contact and no real
 * token appears here or in the completion report.
 *
 * The bank values are deliberately unusable: the BIN `970000` is unassigned, the
 * account number is a repeating pattern, and the holder is marked `(DEMO)` — the
 * same synthetic set `APP7-D01` drew with, so a fixture can never be mistaken for
 * production configuration.
 *
 * The amount is deliberately awkward. `5100000.00` is not a round million and is
 * *not* recomputable from anything else in these fixtures: there is no order
 * total here to take 40 % of, precisely so a screen that tried to derive the
 * deposit would have nothing to derive it from and would have to invent one.
 */
import {
  CustomerDepositResponseDepositStatus,
  CustomerDepositResponseOrderStatus,
  DepositAttemptResponseMethod,
  DepositAttemptResponseStatus,
  TransferEvidenceItemResponseAssetStatus,
  TransferEvidenceItemResponseMediaType,
  TransferEvidenceUploadResponseAssetStatus,
  type CustomerDepositResponse,
  type DepositAttemptResponse,
  type TransferEvidenceItemResponse,
  type TransferEvidenceListResponse,
  type TransferEvidenceUploadResponse,
} from '@embroidery/api-client';

export const ORDER_CODE = 'ORD-K7M2Q9XR4T';
export const TRANSFER_REFERENCE = 'ORDK7M2Q9XR4TDC';
export const DEPOSIT_AMOUNT = '5100000.00';
export const ACCOUNT_NUMBER = '0000111122223';
export const ATTEMPT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';
export const SECOND_ATTEMPT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3402';

export function makeDeposit(
  overrides: Partial<CustomerDepositResponse> = {},
): CustomerDepositResponse {
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
    depositAmount: DEPOSIT_AMOUNT,
    depositStatus: CustomerDepositResponseDepositStatus.PENDING,
    orderCode: ORDER_CODE,
    orderStatus: CustomerDepositResponseOrderStatus.AWAITING_DEPOSIT,
    ...overrides,
  };
}

/** The deposit after an Admin verified it: both authoritative fields moved. */
export function makeVerifiedDeposit(): CustomerDepositResponse {
  return makeDeposit({
    depositStatus: CustomerDepositResponseDepositStatus.SATISFIED,
    orderStatus: CustomerDepositResponseOrderStatus.DEPOSIT_PAID,
  });
}

export function makeAttempt(
  overrides: Partial<DepositAttemptResponse> = {},
): DepositAttemptResponse {
  return {
    amount: DEPOSIT_AMOUNT,
    attemptId: ATTEMPT_ID,
    currencyCode: 'VND',
    method: DepositAttemptResponseMethod.BANK_TRANSFER,
    replayed: false,
    status: DepositAttemptResponseStatus.PENDING,
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
    createdAt: '2026-08-23T09:36:00.000Z',
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

/** Five images, so the quota is reached exactly and not by one over. */
export function makeFullEvidenceList(): TransferEvidenceListResponse {
  return makeEvidenceList(
    Array.from({ length: 5 }, (_, index) =>
      makeEvidenceItem({
        assetStatus: TransferEvidenceItemResponseAssetStatus.ACCEPTED,
        evidenceId: `3f2504e0-4f89-41d3-9a0c-0305e82c35${String(index).padStart(2, '0')}`,
      }),
    ),
  );
}

export function makeUpload(
  overrides: Partial<TransferEvidenceUploadResponse> = {},
): TransferEvidenceUploadResponse {
  return {
    assetStatus: TransferEvidenceUploadResponseAssetStatus.INSPECTING,
    byteSize: 2_516_582,
    evidenceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3502',
    mediaType: TransferEvidenceItemResponseMediaType['image/jpeg'],
    replayed: false,
    ...overrides,
  };
}

/**
 * Points the jsdom window at `/truy-cap/thanh-toan` with the given fragment.
 *
 * jsdom refuses a cross-origin `history.replaceState`, so the pathname is set
 * through a same-origin replace first; the fragment is then appended exactly as
 * a real secure link would deliver it.
 */
export function navigateToDeposit(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap/thanh-toan${fragment}`);
}

/** A file the local guard accepts, so the assertion is about the request. */
export function makeImageFile(name = 'bien-lai.jpg', type = 'image/jpeg', size = 2_516_582): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
