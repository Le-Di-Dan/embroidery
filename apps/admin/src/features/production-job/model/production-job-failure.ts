/**
 * What a failed job read or a refused transition means, decided from the
 * normalized envelope and never from a message string.
 *
 * ### Two classifiers, because a read and a transition fail differently
 *
 * A **read** either produced the job or did not, and a `GET` that dropped its
 * connection changed nothing — so there is no ambiguous band for it and
 * retrying is always safe.
 *
 * A **transition** has an outcome a read can never have: it may have committed
 * under the row lock and lost its answer on the way back. `APP8-B04` publishes
 * no idempotency key for the operation, so a resend is a *second* command, not a
 * repeat of the first. That case is `ambiguous`, and it concludes nothing: it
 * re-reads authoritative truth and offers no resubmit (`786:194`).
 *
 * ### The code is read as a structured field, never parsed out of prose
 *
 * `normalized.message` is not read anywhere in this module and is not rendered
 * anywhere in this feature. The published `code` decides the branch and the
 * classification decides the sentence, so no server prose, SQL fragment or
 * stack can reach an operator as the copy.
 *
 * ### There is no retryable-conflict band, because no such code exists
 *
 * `APP8-B04` resolves contention with row locks: the loser blocks, re-reads and
 * receives an ordinary `409`. `787:186` is explicit that inventing a
 * "retryable conflict" classification for a code the contract does not publish
 * is forbidden, so every `409` here is "state changed — reload".
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

/** The published refusal codes `APP8-B03`/`APP8-B04` can answer this screen with. */
export const PRODUCTION_JOB_NOT_FOUND = 'PRODUCTION_JOB_NOT_FOUND';
export const PRODUCTION_DEPOSIT_NOT_SATISFIED = 'PRODUCTION_DEPOSIT_NOT_SATISFIED';
export const PRODUCTION_ORDER_ON_HOLD = 'PRODUCTION_ORDER_ON_HOLD';
export const PRODUCTION_BLOCKED = 'PRODUCTION_BLOCKED';
export const PRODUCTION_APPROVAL_MISMATCH = 'PRODUCTION_APPROVAL_MISMATCH';
export const PRODUCTION_RESERVATION_NOT_ACTIVE = 'PRODUCTION_RESERVATION_NOT_ACTIVE';
export const PRODUCTION_RESERVATION_INSUFFICIENT = 'PRODUCTION_RESERVATION_INSUFFICIENT';
export const PRODUCTION_INVALID_TRANSITION = 'PRODUCTION_INVALID_TRANSITION';
export const PRODUCTION_CANCELLATION_REASON_REQUIRED = 'PRODUCTION_CANCELLATION_REASON_REQUIRED';

/** The only error type this feature's services throw. */
export class ProductionJobApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin production job API call failed.');
    this.name = 'ProductionJobApiError';
    this.normalized = normalized;
  }
}

export function isProductionJobApiError(error: unknown): error is ProductionJobApiError {
  return error instanceof ProductionJobApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isProductionJobApiError(error) ? error.normalized : null;
}

/** Why the job detail could not be shown. */
export type ProductionJobReadFailure = 'notFound' | 'unauthenticated' | 'forbidden' | 'retryable';

export function classifyProductionJobReadFailure(error: unknown): ProductionJobReadFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_NOT_FOUND:
      return 'notFound';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    default:
      // A malformed id in the URL is the Zod pipe's `400`. It is not "not
      // found" — the job may well exist — and it is not usefully retryable, but
      // the generic failure is the only honest thing this screen can say about
      // it without inventing a diagnosis the contract does not publish.
      return 'retryable';
  }
}

/**
 * Why a transition did not settle. One band per *published* refusal, plus the
 * three transport-shaped ones every Admin write has.
 *
 * `reasonRequired` should be unreachable from this screen: the cancel dialog
 * blocks a blank reason locally rather than sending a request that is certain
 * to fail (`786:171`). It is classified anyway, because a screen that could not
 * name a refusal the server actually publishes would fall back to the generic
 * failure and tell the operator less than the server did.
 */
export type ProductionTransitionRefusal =
  | 'depositNotSatisfied'
  | 'orderOnHold'
  | 'blocked'
  | 'approvalMismatch'
  | 'reservationNotActive'
  | 'reservationInsufficient'
  | 'invalidTransition'
  | 'reasonRequired'
  | 'notFound'
  | 'unauthenticated'
  | 'forbidden'
  | 'ambiguous'
  | 'server';

/**
 * The published code → refusal band. Exhaustive over what `APP8-B04` publishes
 * for this screen's three commands; anything absent falls through to the status
 * classification below rather than being guessed at.
 */
const REFUSAL_OF_CODE: Readonly<Record<string, ProductionTransitionRefusal>> = {
  [PRODUCTION_DEPOSIT_NOT_SATISFIED]: 'depositNotSatisfied',
  [PRODUCTION_ORDER_ON_HOLD]: 'orderOnHold',
  [PRODUCTION_BLOCKED]: 'blocked',
  [PRODUCTION_APPROVAL_MISMATCH]: 'approvalMismatch',
  [PRODUCTION_RESERVATION_NOT_ACTIVE]: 'reservationNotActive',
  [PRODUCTION_RESERVATION_INSUFFICIENT]: 'reservationInsufficient',
  [PRODUCTION_INVALID_TRANSITION]: 'invalidTransition',
  [PRODUCTION_CANCELLATION_REASON_REQUIRED]: 'reasonRequired',
  [PRODUCTION_JOB_NOT_FOUND]: 'notFound',
};

export function classifyProductionTransitionRefusal(error: unknown): ProductionTransitionRefusal {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'ambiguous';

  const status = normalized.httpStatus;
  // No response line at all — a dropped connection, a timeout, an aborted
  // request. The server's answer is unknown, not negative, and this is the one
  // band that must never invite a resend.
  if (status === undefined || status === 0) return 'ambiguous';

  // The structured code first: it is more specific than the status, and two
  // different `409`s mean two different things an operator acts on differently.
  const byCode = REFUSAL_OF_CODE[normalized.code];
  if (byCode !== undefined) return byCode;

  switch (status) {
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    case HTTP_NOT_FOUND:
      return 'notFound';
    case HTTP_BAD_REQUEST:
      return 'server';
    default:
      // Every `5xx` lands here. The platform replaces a `5xx` code and message
      // with a generic pair, so nothing distinguishes "refused" from "committed
      // then failed to answer" — it is treated as unknown, not as a failure.
      return status >= HTTP_SERVER_ERROR ? 'ambiguous' : 'server';
  }
}

/**
 * Whether the operator's typed cancellation reason survives the refusal.
 *
 * It survives everything except a lost session, where the text would sit in a
 * dialog behind a screen the operator has to leave anyway. In particular it
 * survives every `409`: the reason was never the problem, and retyping it after
 * a concurrent state change would be busywork the refusal did not require.
 */
export function preservesCancellationReason(refusal: ProductionTransitionRefusal): boolean {
  return refusal !== 'unauthenticated';
}
