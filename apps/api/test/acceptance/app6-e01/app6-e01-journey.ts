/**
 * The `APP6-E01` journey driver — one function per **owning APP6 operation**.
 *
 * Every step is a real HTTP call against the composed application, through the
 * real guards, with the real request and response contracts. There is no
 * repository shortcut in this file and no direct status write anywhere in it:
 * the four `system` states of §7.1 (`QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW`,
 * `APPROVED`) are reachable here only as projections of the operations below,
 * because nothing here can write a status at all.
 *
 * `DIGITIZING` is the single exception the phase plan names: it is APP6's one
 * directly commanded transition (`TR-LC11-07`, `GRD-005`), and it is commanded
 * through the delivered moderation route like any operator would.
 *
 * ### The network source
 *
 * Every public call carries an explicit `X-Forwarded-For`. The delivered
 * `PublicNetworkKeyService` reads the **last** entry — the one a trusted hop
 * appended — and this harness *is* the trusted hop, so giving each case its own
 * synthetic source keeps the real 30-requests-per-minute limiter switched on
 * while stopping one case's negatives from rate-limiting the next case's happy
 * path. The limiter is never disabled and its policy is never rewritten.
 *
 * Test-only.
 */
import type { Server } from 'node:http';

import request from 'supertest';
import type { Response } from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../src/bootstrap/api-application';

/** Every route this run drives, written once. */
export const ROUTE = {
  /** `APP6-B01` — create the quotation with its first draft version. */
  createQuotation: `/${GLOBAL_ROUTE_PREFIX}/admin/quotations`,
  /** `APP6-B01` — append a further draft version. */
  addQuotationVersion: (quotationId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/quotations/${quotationId}/versions`,
  /** `APP6-B02` — version history and one version's detail. */
  quotationHistory: (quotationId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/quotations/${quotationId}/versions`,
  quotationVersion: (quotationId: string, versionId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/quotations/${quotationId}/versions/${versionId}`,
  /** `APP6-B03` — send one exact version. */
  sendQuotation: (quotationId: string, versionId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/quotations/${quotationId}/versions/${versionId}/send`,
  /** `APP6-B04` / `APP6-B05` — the customer's three public operations. */
  currentQuotation: `/${GLOBAL_ROUTE_PREFIX}/public/quotations/current`,
  acceptQuotation: `/${GLOBAL_ROUTE_PREFIX}/public/quotations/accept`,
  rejectQuotation: `/${GLOBAL_ROUTE_PREFIX}/public/quotations/reject`,
  /** `APP6-B06` — the one directly commanded APP6 transition. */
  transitions: (requestId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/transitions`,
  /** `APP6-B07` — the digitizing source. */
  submittedDesign: (requestId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/submitted-design`,
  /** `APP6-B08` — author a formal version; list the case's versions. */
  designVersions: (requestId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/design-versions`,
  designVersion: (requestId: string, versionId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/design-versions/${versionId}`,
  /** `APP6-B09` — send that exact version for review. */
  sendDesignVersion: (requestId: string, versionId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/design-versions/${versionId}/send`,
  /** `APP6-B10` / `APP6-B11` — the customer's three public design operations. */
  currentReview: `/${GLOBAL_ROUTE_PREFIX}/public/design-reviews/current`,
  approveDesign: `/${GLOBAL_ROUTE_PREFIX}/public/design-reviews/approve`,
  requestRevision: `/${GLOBAL_ROUTE_PREFIX}/public/design-reviews/request-revision`,
} as const;

/** One priced line, as the Admin contract accepts it. */
export interface PricedLine {
  readonly lineKind: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceAmount: string;
}

export interface DraftPricing {
  readonly quantityTotal: number;
  readonly stitchCount?: number;
  readonly shippingFeeAmount: string;
  readonly manualAdjustmentAmount?: string;
  readonly adjustmentReason?: string;
  readonly lineItems: readonly PricedLine[];
}

/** One accepted agreement, exactly as `APP6-B10` returned it. */
export interface AcceptedAgreement {
  readonly agreementVersionId: string;
  readonly contentHash: string;
}

export interface JourneyDriver {
  /* Admin — the commercial lane. */
  createQuotation(requestId: string, pricing: DraftPricing): request.Test;
  addQuotationVersion(quotationId: string, pricing: DraftPricing): request.Test;
  quotationHistory(quotationId: string): request.Test;
  quotationVersion(quotationId: string, versionId: string): request.Test;
  sendQuotation(quotationId: string, versionId: string): request.Test;
  /* Admin — the transition and the design lane. */
  startDigitizing(requestId: string): request.Test;
  submittedDesign(requestId: string): request.Test;
  authorDesignVersion(requestId: string, body: Record<string, unknown>): request.Test;
  designVersions(requestId: string): request.Test;
  designVersion(requestId: string, versionId: string): request.Test;
  sendDesignVersion(requestId: string, versionId: string): request.Test;
  /* Customer — the public lane, over a secure link. */
  readQuotation(token: string, source?: string): request.Test;
  acceptQuotation(token: string, versionId: string, source?: string): request.Test;
  rejectQuotation(token: string, versionId: string, source?: string): request.Test;
  readReview(token: string, source?: string): request.Test;
  approveDesign(
    token: string,
    versionId: string,
    documentHash: string,
    acceptedAgreements: readonly AcceptedAgreement[],
    source?: string,
  ): request.Test;
  requestRevision(
    token: string,
    versionId: string,
    feedback: string,
    source?: string,
  ): request.Test;
}

/**
 * Binds the driver to one composed application, one Admin cookie and one
 * default public source address.
 */
export function createJourneyDriver(
  server: () => Server,
  adminCookie: () => string,
  defaultSource: string,
): JourneyDriver {
  const admin = (test: request.Test): request.Test => test.set('Cookie', adminCookie());
  const publicCall = (test: request.Test, source: string | undefined): request.Test =>
    test.set('X-Forwarded-For', source ?? defaultSource);

  return {
    createQuotation: (requestId, pricing) =>
      admin(
        request(server())
          .post(ROUTE.createQuotation)
          .send({ customRequestId: requestId, ...pricing }),
      ),

    addQuotationVersion: (quotationId, pricing) =>
      admin(
        request(server())
          .post(ROUTE.addQuotationVersion(quotationId))
          .send({ ...pricing }),
      ),

    quotationHistory: (quotationId) =>
      admin(request(server()).get(ROUTE.quotationHistory(quotationId))),

    quotationVersion: (quotationId, versionId) =>
      admin(request(server()).get(ROUTE.quotationVersion(quotationId, versionId))),

    sendQuotation: (quotationId, versionId) =>
      admin(request(server()).post(ROUTE.sendQuotation(quotationId, versionId))),

    // `TR-LC11-07`. The only status this run ever names in a request body, and
    // the only one the phase plan permits an operator to command.
    startDigitizing: (requestId) =>
      admin(request(server()).post(ROUTE.transitions(requestId)).send({ toStatus: 'DIGITIZING' })),

    submittedDesign: (requestId) => admin(request(server()).get(ROUTE.submittedDesign(requestId))),

    authorDesignVersion: (requestId, body) =>
      admin(request(server()).post(ROUTE.designVersions(requestId)).send(body)),

    designVersions: (requestId) => admin(request(server()).get(ROUTE.designVersions(requestId))),

    designVersion: (requestId, versionId) =>
      admin(request(server()).get(ROUTE.designVersion(requestId, versionId))),

    sendDesignVersion: (requestId, versionId) =>
      admin(request(server()).post(ROUTE.sendDesignVersion(requestId, versionId))),

    readQuotation: (token, source) =>
      publicCall(request(server()).post(ROUTE.currentQuotation).send({ token }), source),

    acceptQuotation: (token, versionId, source) =>
      publicCall(request(server()).post(ROUTE.acceptQuotation).send({ token, versionId }), source),

    rejectQuotation: (token, versionId, source) =>
      publicCall(request(server()).post(ROUTE.rejectQuotation).send({ token, versionId }), source),

    readReview: (token, source) =>
      publicCall(request(server()).post(ROUTE.currentReview).send({ token }), source),

    approveDesign: (token, versionId, documentHash, acceptedAgreements, source) =>
      publicCall(
        request(server())
          .post(ROUTE.approveDesign)
          .send({ token, versionId, documentHash, acceptedAgreements }),
        source,
      ),

    requestRevision: (token, versionId, feedback, source) =>
      publicCall(
        request(server()).post(ROUTE.requestRevision).send({ token, versionId, feedback }),
        source,
      ),
  };
}

/** The envelope's `data`, typed. Supertest types `response.body` as `any`. */
export function dataOf<T>(response: Response): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`. */
export function codeOf(response: Response): string | undefined {
  return (response.body as { readonly code?: string }).code;
}

/** A serviceable default pricing shape; every case varies the unit price. */
export function pricingAt(unitPrice: number, quantityTotal = 24): DraftPricing {
  return {
    quantityTotal,
    stitchCount: 8_500,
    shippingFeeAmount: '50000.00',
    lineItems: [
      {
        lineKind: 'PRODUCT',
        description: 'Áo thêu ngực trái',
        quantity: quantityTotal,
        unitPriceAmount: `${String(unitPrice)}.00`,
      },
    ],
  };
}
