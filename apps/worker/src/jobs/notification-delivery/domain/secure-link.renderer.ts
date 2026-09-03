/**
 * The secure-link fragment form (`APP4-B05` §13, `ADR-APP4-001` §11).
 *
 * One function, one string:
 *
 * ```text
 * <storefront-origin><landing-path>#t=<opaque-token>
 * ```
 *
 * ### The landing is chosen, not assumed (`APP12-S03-C1`)
 *
 * There are two grant scopes and two Storefront surfaces, and each surface
 * refuses the other scope's token. A renderer with one hard-coded path is
 * therefore not "simpler" — it is a renderer that is wrong for one of the two
 * scopes, which is how `ORDER_ACCESS` links reached the custom-request page and
 * were refused there as wrong-scope.
 *
 * The landing arrives already decided, from the sealed payload, and is looked up
 * in a closed table. This function accepts no path and builds none: an arbitrary
 * string cannot be routed here, and a scope with no table entry produces no URL
 * at all rather than a plausible wrong one.
 *
 * ### Why the fragment is the whole point
 *
 * A URL fragment is **never sent to the origin by any user agent**. Put the same
 * token in a path or a query and it is written to the Nginx access log, the
 * application request log, any proxy in front of them, and the `Referer` header
 * of every outbound link the landing page later renders. The fragment is the
 * only browser carrier that keeps a bearer credential out of all of those, which
 * is why `secure_link.queryOrPathCarrier` is `FORBIDDEN` with no fallback: a
 * "graceful degradation" to `?t=` would degrade into logging the credential.
 *
 * ### This is not a template system
 *
 * It composes a URL and returns it. It has no message body, no subject, no
 * locale, no channel branch and no provider type — the outbound message is the
 * adapter's business, and a renderer that grew a body would become the shared
 * template layer `ADR-DB2-003` places outside this phase.
 *
 * ### Lifetime
 *
 * The returned string contains the plaintext token. It is built immediately
 * before the channel call, handed to the port, and dropped with the rest of the
 * decrypted delivery when the attempt ends. Nothing persists it, logs it or
 * returns it upward.
 */
import type { SecureLinkLanding } from '@embroidery/notification-delivery';

import {
  SECURE_LINK_FRAGMENT_PREFIX,
  SECURE_LINK_LANDING_PATHS,
} from '../config/storefront-origin.config';

/**
 * Composes the customer-visible secure link.
 *
 * `origin` is already normalized by `loadStorefrontPublicOrigin` — absolute,
 * no trailing slash, no path, query or fragment of its own — so this is a
 * concatenation rather than a URL builder. Building it through `new URL()` and
 * assigning `hash` would re-encode the token's base64url characters
 * inconsistently across Node versions, and the landing page compares what it
 * reads to the 43-character accepted form.
 *
 * `landing` is the grant scope the token was issued under, carried from the
 * issuing side inside the ciphertext. It is validated rather than trusted: the
 * type says the set is closed, and the guard says so again at runtime, because
 * the value has just come out of JSON. An unknown one throws, so the delivery
 * fails without a URL instead of sending the customer somewhere their token
 * does not open.
 */
export function renderSecureLinkUrl(
  origin: string,
  rawToken: string,
  landing: SecureLinkLanding,
): string {
  const path = SECURE_LINK_LANDING_PATHS[landing];
  if (path === undefined) {
    throw new Error('Unknown secure-link landing: refusing to compose a link.');
  }
  return `${origin}${path}${SECURE_LINK_FRAGMENT_PREFIX}${rawToken}`;
}
