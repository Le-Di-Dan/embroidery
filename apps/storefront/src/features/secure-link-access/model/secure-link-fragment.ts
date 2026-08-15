/**
 * The secure-link fragment carrier (`APP4-S02` §3, §6, §16; approved annotation
 * `634:53`–`634:58`).
 *
 * Two functions and nothing else: read the token out of `location.hash`, and
 * remove the fragment from the visible URL. They are separated from React on
 * purpose — the ordering rule this checkpoint exists to enforce ("strip before
 * the request leaves") is a property of *when they are called*, and a pure pair
 * can be called in one straight-line block whose order is readable in the diff
 * rather than inferred from effect scheduling.
 *
 * ### Why the fragment, and why there is no fallback
 *
 * A URL fragment is never sent to the origin by any user agent. The same token
 * in a path or a query lands in the gateway access log, the application request
 * log, every proxy in between, and the `Referer` of every outbound link the
 * page later renders. `APP4-W01` composes the outbound link with exactly this
 * carrier (`secure-link.renderer.ts`), and `ADR-APP4-001` §11 marks a query or
 * path carrier `FORBIDDEN` **with no fallback** — because a "graceful
 * degradation" to `?t=` would degrade into logging the credential. So a
 * malformed fragment is not repaired here and no other source is consulted.
 *
 * ### Bytes are never normalized
 *
 * The token is a bearer credential compared byte-for-byte against a peppered
 * digest on the server. It is read with `slice` and matched against the
 * contract's own pattern — no `decodeURIComponent`, no trim, no case fold, no
 * `URLSearchParams`. Every one of those is a transformation that would turn a
 * valid credential into a 404 nobody could explain, and base64url has no
 * character that needs any of them.
 */

/** The one accepted fragment key. There is no alternate spelling. */
export const SECURE_LINK_FRAGMENT_KEY = 't';

/** `#t=` — the exact prefix `APP4-W01` writes into every outbound link. */
export const SECURE_LINK_FRAGMENT_PREFIX = `#${SECURE_LINK_FRAGMENT_KEY}=`;

/**
 * The accepted token shape, transcribed from the B06 request contract.
 *
 * `ResolveSecureLinkBody.token` publishes `^[A-Za-z0-9_-]{43}$` — 256 bits of
 * CSPRNG entropy in unpadded base64url (`APP4-G01` PO-06). Orval emits that
 * pattern as JSDoc rather than as a runtime value, so it cannot be imported;
 * the S02 gate therefore reads the generated schema file and asserts this
 * source string still equals the published pattern, which is what keeps the two
 * from drifting apart silently.
 */
export const SECURE_LINK_TOKEN_PATTERN_SOURCE = '^[A-Za-z0-9_-]{43}$';

const SECURE_LINK_TOKEN_PATTERN = new RegExp(SECURE_LINK_TOKEN_PATTERN_SOURCE);

/**
 * The longest fragment that could possibly carry a valid token.
 *
 * Parsing is bounded before any pattern is applied: a hostile link can put
 * megabytes after `#`, and the answer for anything longer than the one accepted
 * form is already known without looking at it.
 */
const MAX_FRAGMENT_LENGTH = SECURE_LINK_FRAGMENT_PREFIX.length + 43;

/**
 * Reads the canonical token out of a raw `location.hash`.
 *
 * Returns `undefined` for every input that is not exactly `#t=<43 base64url
 * characters>` — missing, empty, a different key, extra parameters, a wrong
 * length, an out-of-alphabet character. The caller renders the *same*
 * unavailable state for all of them and makes no request, so fragment syntax
 * never becomes a debug oracle (§14).
 */
export function readSecureLinkToken(hash: string): string | undefined {
  if (hash.length > MAX_FRAGMENT_LENGTH) return undefined;
  if (!hash.startsWith(SECURE_LINK_FRAGMENT_PREFIX)) return undefined;
  const candidate = hash.slice(SECURE_LINK_FRAGMENT_PREFIX.length);
  return SECURE_LINK_TOKEN_PATTERN.test(candidate) ? candidate : undefined;
}

/**
 * Removes the fragment from the visible URL, in place.
 *
 * `history.replaceState` rather than a router navigation: `router.replace`
 * would enqueue an App Router transition — asynchronous, and capable of issuing
 * its own RSC request — which is precisely the "something happens before the
 * fragment is gone" this checkpoint forbids. `replaceState` is synchronous and
 * touches nothing but the address bar and the current history entry.
 *
 * The existing history state is passed straight back through, so whatever Next
 * put there survives and nothing new is written into it. The token is not in it
 * and does not go into it — the browser proof asserts `history.state` is free of
 * it at the moment the resolve request is observed.
 *
 * Called for a malformed fragment too. A credential-shaped string that failed
 * the pattern is still a string somebody sent, and leaving it in the address bar
 * to be screenshotted or pasted would be the leak this function exists to close.
 */
export function stripSecureLinkFragment(historyApi: History, location: Location): void {
  historyApi.replaceState(historyApi.state, '', `${location.pathname}${location.search}`);
}
