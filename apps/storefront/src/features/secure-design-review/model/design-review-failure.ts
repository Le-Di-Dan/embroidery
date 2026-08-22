/**
 * What a refused decision means for the customer (`APP6-S02` §5, §14, §15,
 * §16, §19, §20).
 *
 * `APP6-B11` publishes a **closed** vocabulary of business codes and this file
 * is its whole client-side reading. Nothing here looks at a server `message`:
 * both decisions are reachable by anyone holding a link, the messages are
 * English operator prose the customer never sees, and branching on prose is one
 * copy edit away from a screen that claims the wrong thing.
 *
 * The mapping is by **code first, status second**, in that order, because the
 * codes are the contract and the statuses are shared by refusals that mean
 * different things — four of B11's conflict-class failures are `409`.
 *
 * ### The three that are not failures of the decision at all
 *
 * - `REVERIFICATION_REQUIRED` (403) is a *remedy*, not a refusal: the caller
 *   already proved it holds a live grant, so this says only that GRD-003 wants
 *   a fresh `STEP_UP`. It is approval-only; the revision request never declares
 *   a 403 because asking for a change commits nothing.
 * - `APPROVAL_VERSION_MISMATCH` (409) is GRD-007 — the version or the stored
 *   document hash moved under the customer. The remedy is one re-read and a
 *   completely new decision, never a retry.
 * - `TERMS_NOT_ACCEPTED` (409) is GRD-008 — the effective agreement set is no
 *   longer the one that was submitted. Deliberately **not** folded into the
 *   version mismatch: a terms change is not a design change, and telling the
 *   customer their artwork moved when only a policy did would be a lie the
 *   design explicitly separates (`710:203` versus the terms-changed state).
 *
 * ### Why a 404 is not in this table
 *
 * It is, as `UNAVAILABLE` — the *same* `SECURE_LINK_UNAVAILABLE` APP4's
 * secure-link machinery raises, thrown on a write exactly as on a read. The
 * screen renders the one indistinguishable unavailable card for it and destroys
 * the credential, which is why this classification and `secureLinkOutcomeOf`
 * must never disagree.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

/** The customer-meaningful outcomes of a refused approval or revision request. */
export type DecisionFailure =
  | 'REVERIFICATION_REQUIRED'
  | 'APPROVAL_VERSION_MISMATCH'
  | 'TERMS_NOT_ACCEPTED'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_OPERATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'POLICY_UNAVAILABLE'
  | 'UNAVAILABLE'
  | 'TRANSIENT';

/** The published codes, spelled once. */
const BY_CODE: Readonly<Record<string, DecisionFailure>> = {
  REVERIFICATION_REQUIRED: 'REVERIFICATION_REQUIRED',
  APPROVAL_VERSION_MISMATCH: 'APPROVAL_VERSION_MISMATCH',
  TERMS_NOT_ACCEPTED: 'TERMS_NOT_ACCEPTED',
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
  // The secure-link limiter counts requests and never outcomes, precisely so it
  // cannot become an oracle — so a 429 says nothing about the review either.
  if (status === 429) return 'TRANSIENT';
  // B11's policy/evidence failure publishes **no code** by design: an
  // unpublished policy key is server-configuration detail. The status is the
  // only signal, and it is one operator action from resolved. It must never be
  // reported as "you failed to accept terms" (§15).
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
 * are the ones that can become a notice on the review card, and narrowing here
 * is what makes it a compile error to route `UNAVAILABLE` — an ended session —
 * into a banner over a screen that no longer has a link to show.
 */
export function endsSecureSession(failure: DecisionFailure): failure is 'UNAVAILABLE' {
  return failure === 'UNAVAILABLE';
}

/**
 * Whether this failure obliges exactly one current-review re-read.
 *
 * Bounded to the refusals that are statements about server state the screen is
 * now known to be showing wrongly (§14, §15, §16, §19).
 *
 * `DUPLICATE_OPERATION` is deliberately **not** among them: it says another
 * attempt at the *same* decision is still in flight, so nothing has changed to
 * re-read, and a re-read there would be the beginning of a polling loop.
 */
export function requiresReconciliationRead(failure: DecisionFailure): boolean {
  return (
    failure === 'APPROVAL_VERSION_MISMATCH' ||
    failure === 'TERMS_NOT_ACCEPTED' ||
    failure === 'INVALID_TRANSITION' ||
    failure === 'IDEMPOTENCY_CONFLICT'
  );
}

/**
 * The failures that may be shown as a banner over a review that is still there.
 *
 * A type predicate rather than a cast at the call site: the four excluded
 * failures each have a *state* of their own — an ended session, a step-up, a
 * mismatch reconciliation, a terms reconciliation — and narrowing here makes it
 * a compile error to route any of them into a banner instead.
 */
export function isDecisionNotice(
  failure: DecisionFailure,
): failure is Exclude<
  DecisionFailure,
  'REVERIFICATION_REQUIRED' | 'APPROVAL_VERSION_MISMATCH' | 'TERMS_NOT_ACCEPTED' | 'UNAVAILABLE'
> {
  return (
    failure !== 'REVERIFICATION_REQUIRED' &&
    failure !== 'APPROVAL_VERSION_MISMATCH' &&
    failure !== 'TERMS_NOT_ACCEPTED' &&
    failure !== 'UNAVAILABLE'
  );
}
