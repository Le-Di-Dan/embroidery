/**
 * The query keys `/truy-cap/don-hang` uses (`APP12-S03` §33, §41).
 *
 * ## No credential is ever part of a key
 *
 * A TanStack key is serialized into the cache and into devtools, so a
 * secure-link token placed in one would survive in a structure this feature
 * otherwise takes care never to write it into. The keys below name *what* is
 * being read and, for evidence, *which attempt* — never *who is allowed to read
 * it*. The credential reaches the transport as a request-body argument on the
 * stack and nowhere else, and the boundary suite asserts this file contains no
 * token-shaped parameter at all.
 *
 * ## Why the root is this route's own
 *
 * `secure-deposit` and `secure-final-payment` name the two custom lanes' caches.
 * All three read a payment obligation on an order through sibling operations,
 * and a shared root would let a deposit QR and a Ready-Made QR collide on one
 * key — the same image slot for two different amounts. Distinct roots make that
 * impossible rather than unlikely.
 *
 * ## Why the order and FULL keys name nothing at all
 *
 * `publicReadyMadeOrder_current` and `publicOrderFullPayment_current` each take
 * only a token, and the token is the one thing that may not appear here. There
 * is exactly one secure context per mounted route — `SecureLinkQueryProvider`
 * creates a fresh `QueryClient` per mount with `gcTime: 0`, so nothing survives
 * the session that produced it — which means a constant key is already scoped
 * to precisely one order and cannot collide with another customer's.
 *
 * ## Why the evidence key does name the attempt
 *
 * Evidence is addressed by `attemptId`, a locator the server published to this
 * client and which the contract states plainly is "a locator, never an
 * authorization": an attempt that is not yours is indistinguishable from one
 * that does not exist. Naming it here is also what makes §24 mechanical — when
 * a fee correction supersedes the obligation the current attempt changes, the
 * key changes with it, and the predecessor's list cannot be shown against the
 * successor.
 */
const ROOT = 'secure-ready-made-order';

export const ORDER_ACCESS_QUERY_KEYS = {
  /** The live FULL obligation for the order this link opens. */
  fullPayment: () => [ROOT, 'full-payment'] as const,
  /** The bank-transfer QR for that obligation. */
  qr: () => [ROOT, 'qr'] as const,
  /** The transfer images submitted for one exact attempt. */
  evidence: (attemptId: string) => [ROOT, 'evidence', attemptId] as const,
} as const;
