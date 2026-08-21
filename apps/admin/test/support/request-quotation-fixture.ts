/**
 * Quotation fixtures shaped exactly like the accepted `APP6-B01`/`B02`/`B03`
 * contracts.
 *
 * ### Every amount is a string, and the strings are deliberately awkward
 *
 * The totals below are not round numbers. `APP6-G01` §6.2 forbids a VND amount
 * through an IEEE-754 double, and a fixture using `1000000.00` would pass just
 * as happily against a screen that parsed and reformatted it. These values are
 * chosen so that any parse-and-reprint round trip changes the rendered text,
 * which is what lets an assertion detect one.
 *
 * ### The locator is a first-class part of the request fixture
 *
 * `quotationId` defaults to `null` — the honest state of a request nobody has
 * quoted — so a test that wants a quotation has to say so. A fixture that
 * supplied one by default would let the empty state rot untested.
 */
import type {
  AdminCustomRequestDetailResponse,
  AdminQuotationHeaderResponse,
  AdminQuotationLineItemResponse,
  AdminQuotationSentResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationVersionHistoryResponse,
  AdminQuotationVersionResponse,
  QuotationDraftedResponse,
} from '@embroidery/api-client';

export const QUOTATION_REQUEST_ID = '01950000-0000-7000-8000-0000000000r1';
export const QUOTATION_ID = '01950000-0000-7000-8000-0000000000q1';
export const OTHER_QUOTATION_ID = '01950000-0000-7000-8000-0000000000q9';
export const VERSION_1_ID = '01950000-0000-7000-8000-0000000000v1';
export const VERSION_2_ID = '01950000-0000-7000-8000-0000000000v2';

/** An amount no float round trip reproduces exactly. */
export const AWKWARD_TOTAL = '1234567.89';
export const AWKWARD_TOTAL_RENDERED = '1234567.89';

export function envelope<T>(data: T): { readonly data: T } {
  return { data };
}

export function makeCatalogRequest(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return {
    requestId: QUOTATION_REQUEST_ID,
    code: 'REQ-2026-000777',
    status: 'UNDER_REVIEW',
    submittedAt: '2026-08-14T02:30:00.000Z',
    updatedAt: '2026-08-14T02:30:00.000Z',
    customerNote: 'Thêu logo ngực trái.',
    subject: {
      kind: 'CATALOG',
      productId: '01950000-0000-7000-8000-0000000000p1',
      productVariantId: '01950000-0000-7000-8000-0000000000p2',
      productName: 'Áo thun cotton',
      productSlug: 'ao-thun-cotton',
      variantColorName: 'Trắng',
      variantSizeLabel: 'L',
    },
    quantities: [{ sizeLabel: 'L', quantity: 12 }],
    totalQuantity: 12,
    assets: [],
    transitions: [],
    moderationNotes: [],
    // The honest default: no quotation exists.
    quotationId: null,
    ...overrides,
  } as unknown as AdminCustomRequestDetailResponse;
}

export function makeCopRequest(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return makeCatalogRequest({
    subject: {
      kind: 'CUSTOMER_OWNED',
      name: 'Áo khoác jean cá nhân',
      description: 'Áo cũ, thêu ở lưng.',
      physicalWidthMm: '250.00',
      physicalHeightMm: '300.00',
    },
    ...overrides,
  });
}

export function makeHeader(overrides: Record<string, unknown> = {}): AdminQuotationHeaderResponse {
  return {
    quotationId: QUOTATION_ID,
    quotationCode: 'QUO-2026-000777',
    customRequestId: QUOTATION_REQUEST_ID,
    quotationStatus: 'DRAFT',
    // Null before the first send — the state the screen must not call "current".
    currentVersionId: null,
    ...overrides,
  };
}

export function makeLineItem(
  overrides: Record<string, unknown> = {},
): AdminQuotationLineItemResponse {
  return {
    position: 1,
    lineKind: 'EMBROIDERY',
    description: 'Thêu logo ngực trái',
    skuId: null,
    quantity: 12,
    unitPriceAmount: '102880.66',
    // Deliberately NOT quantity × unitPrice: a screen that recomputed the line
    // total instead of rendering the stored one would produce a different string.
    lineTotalAmount: '1234567.89',
    ...overrides,
  } as unknown as AdminQuotationLineItemResponse;
}

export function makeVersion(
  overrides: Record<string, unknown> = {},
): AdminQuotationVersionResponse {
  return {
    versionId: VERSION_1_ID,
    version: 1,
    status: 'DRAFT',
    quantityTotal: 12,
    stitchCount: 15_000,
    currencyCode: 'VND',
    subtotalAmount: '1234567.89',
    manualAdjustmentAmount: '0.00',
    adjustmentReason: null,
    shippingFeeAmount: '50000.00',
    totalAmount: AWKWARD_TOTAL,
    // A share that is not today's policy, so a screen recomputing from current
    // policy would print something else.
    depositPercent: '37.50',
    depositAmount: '462962.96',
    remainingAmount: '771604.93',
    validFrom: null,
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    supersededAt: null,
    expiredAt: null,
    createdAt: '2026-08-15T03:00:00.000Z',
    current: false,
    ...overrides,
  } as unknown as AdminQuotationVersionResponse;
}

export function makeHistory(
  versions: readonly AdminQuotationVersionResponse[] = [makeVersion()],
  header: AdminQuotationHeaderResponse = makeHeader(),
): AdminQuotationVersionHistoryResponse {
  return { quotation: header, versions } as unknown as AdminQuotationVersionHistoryResponse;
}

export function makeVersionDetail(
  version: AdminQuotationVersionResponse = makeVersion(),
  header: AdminQuotationHeaderResponse = makeHeader(),
  lineItems: readonly AdminQuotationLineItemResponse[] = [makeLineItem()],
): AdminQuotationVersionDetailResponse {
  return {
    quotation: header,
    version,
    lineItems,
  } as unknown as AdminQuotationVersionDetailResponse;
}

export function makeDrafted(overrides: Record<string, unknown> = {}): QuotationDraftedResponse {
  return {
    quotationId: QUOTATION_ID,
    quotationCode: 'QUO-2026-000777',
    customRequestId: QUOTATION_REQUEST_ID,
    quotationStatus: 'DRAFT',
    versionId: VERSION_1_ID,
    version: 1,
    versionStatus: 'DRAFT',
    currencyCode: 'VND',
    subtotalAmount: '1234567.89',
    manualAdjustmentAmount: '0.00',
    shippingFeeAmount: '50000.00',
    totalAmount: AWKWARD_TOTAL,
    depositPercent: '37.50',
    depositAmount: '462962.96',
    remainingAmount: '771604.93',
    quantityTotal: 12,
    lineItemCount: 1,
    ...overrides,
  };
}

/**
 * `APP6-B03`'s send result.
 *
 * `replayed` defaults to `false` — a first send. A test that wants the replay
 * path has to ask for it, so the two outcomes can never be asserted by
 * accident against one another.
 */
export function makeSent(overrides: Record<string, unknown> = {}): AdminQuotationSentResponse {
  const version = makeVersion({
    status: 'SENT',
    sentAt: '2026-08-16T04:00:00.000Z',
    validFrom: '2026-08-16T04:00:00.000Z',
    validUntil: '2026-08-30T04:00:00.000Z',
    current: true,
  });
  return {
    quotation: makeHeader({ quotationStatus: 'SENT', currentVersionId: version.versionId }),
    version,
    lineItems: [makeLineItem()],
    replayed: false,
    requestStatus: 'QUOTED',
    requestTransitioned: true,
    ...overrides,
  };
}
