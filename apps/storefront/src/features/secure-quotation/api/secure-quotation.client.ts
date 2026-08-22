/**
 * The three browser-side calls `/truy-cap/bao-gia` makes (`APP6-S01` §5).
 *
 * One generated operation each, the repository's own Axios instance, and no URL
 * anywhere in this feature — a route rename arrives as a regenerated client
 * rather than as a 404 nobody notices.
 *
 * ### Why the read is not chained onto `publicSecureLinkResolve`
 *
 * `APP6-B04` performs the whole authorization chain itself — policy, the
 * secure-link limiter, grant resolution, the request the grant names, then the
 * customer-safe projection. Resolving the link first and reading second would
 * authorize the same token twice, spend the same abuse budget twice, and keep
 * the raw credential alive across two flights for a request id this feature
 * never needs and must never display (§17). This is the same ruling `APP5-S02`
 * made for the status landing.
 *
 * ### The credential's whole visible life, in this file
 *
 * It arrives as an argument, is placed in a request body, and is gone when the
 * promise settles. No module-level variable holds it, nothing logs it, and none
 * of the three responses echoes it, so there is nothing to strip on the way
 * back. Each body is built through its generated body type rather than an
 * object literal, so a token cannot land in the wrong field and still compile.
 *
 * ### Why the version id is a parameter and not read from anywhere
 *
 * Both decisions name the exact version the customer was shown (§11). Taking it
 * as an argument means this module has no notion of "the latest version" to
 * fall back on: the caller must pass the id `readCurrentQuotation` returned, and
 * `APP6-B05` re-proves that id is still current inside its own transaction.
 */
import {
  publicQuotationAccept,
  publicQuotationCurrent,
  publicQuotationReject,
  type AcceptQuotationBody,
  type CustomerQuotationResponse,
  type QuotationAcceptedResponse,
  type QuotationRejectedResponse,
  type ReadCurrentQuotationBody,
  type RejectQuotationBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * Exchanges a secure-link token for the quotation version that is current now.
 *
 * The read does not consume the link and writes nothing, which is why it is safe
 * to offer as a manual retry after a transport failure and safe to repeat as the
 * single reconciliation re-read after a step-up (§9, §12).
 */
export async function readCurrentQuotation(token: string): Promise<CustomerQuotationResponse> {
  const requestBody: ReadCurrentQuotationBody = { token };
  const body = await publicQuotationCurrent(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}

/**
 * Commits acceptance of one exact version.
 *
 * Accepting twice replays the first acceptance and writes nothing, so the
 * `replayed` flag on the result is an outcome to report honestly rather than a
 * failure to hide (§19).
 */
export async function acceptQuotation(
  token: string,
  versionId: string,
): Promise<QuotationAcceptedResponse> {
  const requestBody: AcceptQuotationBody = { token, versionId };
  const body = await publicQuotationAccept(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}

/**
 * Declines one exact version.
 *
 * This moves the quotation only. The custom request is not rejected and not
 * cancelled by it, which is what the rejected copy is required to say (§14).
 */
export async function rejectQuotation(
  token: string,
  versionId: string,
): Promise<QuotationRejectedResponse> {
  const requestBody: RejectQuotationBody = { token, versionId };
  const body = await publicQuotationReject(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}
