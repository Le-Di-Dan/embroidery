/**
 * The query keys `/truy-cap/thanh-toan` uses (`APP7-S01` §26).
 *
 * ## No credential is ever part of a key
 *
 * A TanStack key is serialized into the cache and into devtools, so a secure-link
 * token placed in one would survive in a structure this feature otherwise takes
 * care never to write it into. The keys below name *what* is being read and, for
 * evidence, *which attempt* — never *who is allowed to read it*. The credential
 * reaches the transport as a request body argument on the stack and nowhere else.
 *
 * ## Why the QR key names nothing at all
 *
 * `publicOrderDeposit_qr` takes only a token, and the token is the one thing that
 * may not appear here. There is exactly one secure context per mounted route —
 * `SecureLinkQueryProvider` creates a fresh `QueryClient` per mount with
 * `gcTime: 0`, so nothing survives the session that produced it — which means a
 * constant key is already scoped to precisely one deposit and cannot collide with
 * another customer's.
 *
 * ## Why the evidence key does name the attempt
 *
 * Evidence is addressed by `attemptId`, a locator the server published to this
 * client and which the contract states plainly is "a locator and not
 * authorization": an attempt that is not yours is indistinguishable from one that
 * does not exist. Two attempts in one session — the customer retried from the
 * terminal card — have genuinely different evidence sets, and a shared key would
 * show the old attempt's images beside the new attempt's upload control.
 */
const ROOT = 'secure-deposit';

export const DEPOSIT_QUERY_KEYS = {
  /** The bank-transfer QR for the deposit this link opens. */
  qr: () => [ROOT, 'qr'] as const,
  /** The transfer images submitted for one exact attempt. */
  evidence: (attemptId: string) => [ROOT, 'evidence', attemptId] as const,
} as const;
