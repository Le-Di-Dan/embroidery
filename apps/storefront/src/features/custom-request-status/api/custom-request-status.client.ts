/**
 * The single browser-side call `/truy-cap` makes (`APP5-S02` §3).
 *
 * One generated operation, the repository's own Axios instance, and no path
 * string anywhere in this feature — so a route rename arrives as a regenerated
 * client rather than as a 404 nobody notices.
 *
 * ### Why this is the *only* call, and not the second of two
 *
 * `APP5-B03` performs the whole APP4 authorization chain internally: policy,
 * the secure-link rate limiter, secure-link resolution, the exact request the
 * grant names, then the customer-safe projection. Calling
 * `publicSecureLinkResolve` (`APP4-B06`) first and this second would authorize
 * the same token twice, spend the same per-IP abuse budget twice, keep the raw
 * credential alive across two flights, and add a round trip whose entire result
 * — the request id — this call resolves for itself and never discloses. B06
 * remains published and remains APP4's; this landing simply does not chain it.
 *
 * ### The token's whole visible life
 *
 * It arrives as an argument, is placed in the request body, and is gone when
 * the promise settles. It is never assigned to a module-level variable, never
 * logged, never returned; the resolved value is the request projection, which
 * is what the caller needs and contains no credential. B03 never echoes the
 * token back, so there is nothing to strip out of the response.
 *
 * The body is built through `ReadCustomRequestStatusBody` rather than an object
 * literal, so the token cannot land in the wrong field and still compile.
 */
import {
  publicCustomRequestStatus,
  type CustomRequestStatusResponse,
  type ReadCustomRequestStatusBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * Exchanges a secure-link token for the one request it opens.
 *
 * The read does not consume the link, and the same link keeps working until it
 * expires or is revoked. That is why a manual retry after a transport failure
 * is safe to offer — a retried read cannot spend anything.
 */
export async function readCustomRequestStatus(token: string): Promise<CustomRequestStatusResponse> {
  const requestBody: ReadCustomRequestStatusBody = { token };
  const body = await publicCustomRequestStatus(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}
