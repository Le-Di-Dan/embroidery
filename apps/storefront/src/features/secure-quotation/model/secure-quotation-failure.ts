/**
 * What a refused decision means for the customer (`APP6-S01` §4.3, §12, §18,
 * §19).
 *
 * `APP6-B05` publishes a **closed** vocabulary of business codes and this file
 * is its whole client-side reading. Nothing here looks at a server `message`:
 * the two decisions are reachable by anyone holding a link, the messages are
 * English operator prose the customer never sees, and branching on prose is one
 * copy edit away from a screen that claims the wrong thing.
 *
 * The mapping is by **code first, status second**, in that order, because the
 * codes are the contract and the statuses are shared by refusals that mean
 * different things — three of the four conflict-class failures are `409`.
 *
 * ### The two that are not failures of the decision at all
 *
 * - `REVERIFICATION_REQUIRED` (403) is a *remedy*, not a refusal: the caller has
 *   already proved it holds a live grant for this request, so this says only
 *   that GRD-003 wants a fresh `STEP_UP`. Folding it into "unavailable" would
 *   tell a customer whose link works that their link does not, and would remove
 *   the one action that resolves it (§18).
 * - `QUOTE_VERSION_STALE` (409) is the workshop having moved, or the offer
 *   having lapsed — `APP6-B05` merges CC-05 and CC-06 into one code on purpose,
 *   because both have the same remedy and telling them apart would disclose
 *   workshop activity on a request the token may not be for.
 *
 * ### Why a 404 is not in this table
 *
 * It is, as `UNAVAILABLE` — and it is the *same* `SECURE_LINK_UNAVAILABLE`
 * APP4's secure-link machinery raises, thrown from APP4's own error class on a
 * write exactly as it is on a read. The screen renders the one indistinguishable
 * unavailable card for it and destroys the credential, which is why this
 * classification and {@link secureLinkOutcomeOf} must never disagree.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

/**
 * The customer-meaningful outcomes of a refused accept or reject.
 *
 * `UNAVAILABLE` and `TRANSIENT` deliberately carry the same meanings the
 * secure-link landing gives them, so a decision that fails for a transport
 * reason is never reported as a dead link.
 */
export type DecisionFailure =
  | 'REVERIFICATION_REQUIRED'
  | 'QUOTE_VERSION_STALE'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_OPERATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'POLICY_UNAVAILABLE'
  | 'UNAVAILABLE'
  | 'TRANSIENT';

/** The published codes, spelled once. */
const BY_CODE: Readonly<Record<string, DecisionFailure>> = {
  REVERIFICATION_REQUIRED: 'REVERIFICATION_REQUIRED',
  QUOTE_VERSION_STALE: 'QUOTE_VERSION_STALE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  SECURE_LINK_UNAVAILABLE: 'UNAVAILABLE',
};

export function decisionFailureOf(error: NormalizedApiError): DecisionFailure {
  const byCode = BY_CODE[error.code];
  if (byCode !== undefined) return byCode;

  const status = error.httpStatus;
  // No status at all: `NETWORK_ERROR`, `REQUEST_TIMEOUT`,
  // `UNEXPECTED_CLIENT_ERROR`. The request never reached a verdict, so the
  // decision is neither committed nor refused and the customer may try again.
  if (status === undefined) return 'TRANSIENT';
  // The limiter counts requests and never outcomes, precisely so it cannot
  // become an oracle — so a 429 says nothing about the quotation either.
  if (status === 429) return 'TRANSIENT';
  // `DECISION_POLICY_UNAVAILABLE` publishes **no code** by design: the fact that
  // a policy key is unpublished is server-configuration detail. The status is
  // therefore the only signal, and it is one operator action from resolved.
  if (status === 503) return 'POLICY_UNAVAILABLE';
  if (status >= 500) return 'TRANSIENT';
  // A definitive refusal with no code this screen knows — including the 404
  // whose envelope was malformed. Treated as unavailable rather than retryable,
  // because offering a retry against something that will never succeed is worse
  // than ending the attempt.
  if (status === 404) return 'UNAVAILABLE';
  return 'TRANSIENT';
}

/**
 * Whether this failure ends the secure session outright.
 *
 * Exactly one does, and it is the one that means the grant itself is gone.
 *
 * A type predicate rather than a plain boolean: the caller's remaining failures
 * are the ones that can become a notice on the quotation card, and narrowing
 * here is what makes it a compile error to route `UNAVAILABLE` — an ended
 * session — into a banner over a screen that no longer has a link to show.
 */
export function endsSecureSession(failure: DecisionFailure): failure is 'UNAVAILABLE' {
  return failure === 'UNAVAILABLE';
}

/**
 * Whether this failure obliges exactly one current-quotation re-read.
 *
 * Bounded to the three refusals that are statements about server state the
 * screen is now known to be showing wrongly (§12, §14, §19). A duplicate
 * operation is **not** among them: it says another attempt at the *same*
 * decision is still in flight, so nothing has changed to re-read, and a re-read
 * there would be the beginning of a polling loop.
 */
export function requiresReconciliationRead(failure: DecisionFailure): boolean {
  return (
    failure === 'QUOTE_VERSION_STALE' ||
    failure === 'INVALID_TRANSITION' ||
    failure === 'IDEMPOTENCY_CONFLICT'
  );
}
