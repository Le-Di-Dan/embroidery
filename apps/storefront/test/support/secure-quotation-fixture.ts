/**
 * Fixtures for the `/truy-cap/bao-gia` suites (`APP6-S01`).
 *
 * Every value is synthetic. The token comes from the APP4 secure-link fixture
 * rather than being redeclared, so the one test credential in this app has one
 * definition and the secrecy sweeps of both landings assert the absence of the
 * same string. No real token and no real verification code appears here or in
 * the completion report.
 *
 * The amounts are deliberately awkward: a negative adjustment, a total that is
 * *not* the sum a client would compute from the visible rows, and a deposit
 * that does not divide evenly. A screen that quietly recomputed any figure
 * would disagree with these fixtures immediately.
 */
import type {
  CustomerQuotationResponse,
  QuotationAcceptedResponse,
  QuotationRejectedResponse,
} from '@embroidery/api-client';

/** A syntactically valid version id, matching the pattern the bodies publish. */
export const VERSION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
export const NEWER_VERSION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

export function makeQuotation(
  overrides: Partial<CustomerQuotationResponse> = {},
): CustomerQuotationResponse {
  return {
    accessExpiresAt: '2026-09-01T09:00:00.000Z',
    currencyCode: 'VND',
    depositAmount: '1412000.00',
    depositPercent: '40.00',
    expired: false,
    lineItems: [
      {
        description: 'Áo thun cotton — Trắng, size M',
        lineKind: 'PRODUCT',
        lineTotalAmount: '2400000.00',
        position: 1,
        quantity: 20,
        unitPriceAmount: '120000.00',
      },
      {
        description: 'Thêu ngực trái',
        lineKind: 'EMBROIDERY',
        lineTotalAmount: '900000.00',
        position: 2,
        quantity: 20,
        unitPriceAmount: '45000.00',
      },
    ],
    manualAdjustmentAmount: '-170000.00',
    quantityTotal: 20,
    quotationCode: 'QUO-8HT4PN2ZKD',
    quotationStatus: 'SENT',
    remainingAmount: '2118000.00',
    sentAt: '2026-08-19T09:00:00.000Z',
    shippingFeeAmount: '30000.00',
    status: 'SENT',
    subtotalAmount: '3670000.00',
    totalAmount: '3530000.00',
    validFrom: '2026-08-19T09:00:00.000Z',
    validUntil: '2026-08-26T09:00:00.000Z',
    version: 2,
    versionId: VERSION_ID,
    ...overrides,
  };
}

export function makeAccepted(
  overrides: Partial<QuotationAcceptedResponse> = {},
): QuotationAcceptedResponse {
  return {
    acceptedAt: '2026-08-20T08:31:00.000Z',
    acceptedTotalAmount: '3530000.00',
    currencyCode: 'VND',
    quotationStatus: 'ACCEPTED',
    replayed: false,
    requestStatus: 'QUOTE_ACCEPTED',
    version: 2,
    versionId: VERSION_ID,
    versionStatus: 'ACCEPTED',
    ...overrides,
  };
}

export function makeRejected(
  overrides: Partial<QuotationRejectedResponse> = {},
): QuotationRejectedResponse {
  return {
    quotationStatus: 'REJECTED',
    rejectedAt: '2026-08-20T09:05:00.000Z',
    version: 2,
    versionId: VERSION_ID,
    versionStatus: 'REJECTED',
    ...overrides,
  };
}

/**
 * Points the jsdom window at `/truy-cap/bao-gia` with the given fragment.
 *
 * A separate helper from the APP4 landing's rather than a parameter on it: the
 * route is the thing under test here, and a test that could be pointed at the
 * wrong path by a default argument would prove nothing about this one.
 */
export function navigateToQuotation(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap/bao-gia${fragment}`);
}
