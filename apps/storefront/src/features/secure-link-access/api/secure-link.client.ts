/**
 * The single browser-side call `/truy-cap` makes (`APP4-S02` §9).
 *
 * One generated operation, the repository's own Axios instance, and no path
 * string anywhere in this feature — so a route rename arrives as a regenerated
 * client rather than as a 404 nobody notices.
 *
 * ### The token's whole visible life
 *
 * It arrives as an argument, is placed in the request body, and is gone when
 * the promise settles. It is never assigned to a module-level variable, never
 * logged, never returned; the resolved value is the grant, which is what the
 * caller needs and contains no credential. B06 never echoes the token back
 * (`ADR-APP4-001` §11), so there is nothing to strip out of the response.
 *
 * The body is built through `ResolveSecureLinkBody` rather than an object
 * literal, so the token cannot land in the wrong field and still compile.
 */
import {
  publicSecureLinkResolve,
  type ResolveSecureLinkBody,
  type SecureLinkResolutionResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * Exchanges a secure-link token for the grant it opens.
 *
 * Resolution is a **read**: it does not consume the link, and the same link
 * keeps working until it expires or is revoked. That is why a manual retry
 * after a transport failure is safe to offer (§8) — a retried resolve cannot
 * spend anything.
 */
export async function resolveSecureLink(token: string): Promise<SecureLinkResolutionResponse> {
  const requestBody: ResolveSecureLinkBody = { token };
  const body = await publicSecureLinkResolve(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}
