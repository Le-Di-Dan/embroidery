/**
 * Reads the delivered `ORDER_ACCESS` link out of a captured SMTP message
 * (`APP12-E01` §3.7, §5).
 *
 * ## Why this is not `worker-control.secureLinkOf`
 *
 * Every commerce browser run so far took the secure link from the worker's
 * **recording adapter** — an array in this process. That was honest about what it
 * proved (the API issued a grant and the worker composed a URL) and silent about
 * the thing `FU-APP12-H02-01` asks: whether the link a *delivered message*
 * carries is addressed at the configured Storefront origin, and whether the
 * email boundary accepts it at all. Under `NOTIFICATION_TRANSPORT=SMTP` the
 * recording adapter is not in the graph, so there is nothing to read there —
 * which is the point. The link has to come off the wire.
 *
 * ## The link is a credential
 *
 * The URL carries the raw `ORDER_ACCESS` token in its fragment. So the same rule
 * the rest of the commerce harness follows applies here: {@link secureLinkFrom}
 * returns it to exactly one caller, which navigates with it, and
 * {@link secureLinkOriginProof} exists so a spec can assert the *origin* without
 * ever holding the string. Nothing here logs, attaches or filenames it.
 *
 * Test-only.
 */

/** Undoes quoted-printable soft line breaks. Nodemailer folds at 76 bytes. */
function unfold(raw) {
  return raw.replace(/=\r?\n/g, '');
}

/**
 * The `ORDER_ACCESS` URL one captured message carries, or `undefined`.
 *
 * The plain-text alternative prints the link on a line of its own. A fragment is
 * required rather than optional: a match that accepted a bare path would happily
 * return the canonical store URL in the footer, and the caller would navigate to
 * an unauthenticated page and report a routing success.
 *
 * The returned value is a secret. Navigate with it; never assert on it.
 */
export function secureLinkFrom(message, path) {
  const body = unfold(message.raw);
  // Anchored on the configured path, so the footer's store links and the
  // unsubscribe line cannot match. `[^\s<>"]+` stops at whitespace and at the
  // angle brackets an HTML alternative wraps an href in.
  const pattern = new RegExp(`https?://[^\\s<>"]*${escapeForPattern(path)}#t=[^\\s<>"]+`);
  return pattern.exec(body)?.[0];
}

/**
 * Safe facts about the delivered link: its origin, its path, and that it has a
 * fragment at all. Never the fragment.
 *
 * This is what a spec asserts against. `origin` is not a secret — it is the
 * configured public origin an operator sets — and naming it in a failure message
 * is how `FU-APP12-H02-01` becomes readable evidence rather than a boolean.
 */
export function secureLinkOriginProof(link) {
  if (link === undefined) {
    return { found: false };
  }
  const url = new URL(link);
  return {
    found: true,
    origin: url.origin,
    pathname: url.pathname,
    hasFragment: url.hash.startsWith('#t='),
    // A credential belongs in the fragment, which no server and no referrer
    // header ever sees. A query string would be logged by every hop.
    carriesQuery: url.search !== '',
  };
}

function escapeForPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
