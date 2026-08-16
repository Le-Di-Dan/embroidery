/**
 * The four states a secure-link landing can be in, and the rule that maps a
 * failure onto one of them (`APP4-S02` §11–§15).
 *
 * Four states, because `APP4-D01` drew four and no more:
 *
 * | state             | desktop  | mobile   |
 * |-------------------|----------|----------|
 * | `BOOTSTRAP`       | `629:3`  | derived  |
 * | `AUTHORIZED`      | `629:20` | `629:70` |
 * | `UNAVAILABLE`     | `629:37` | `629:87` |
 * | `TRANSIENT_ERROR` | `629:53` | derived  |
 *
 * The two derived cells are deliberate: `APP4-D01` drew no mobile bootstrap and
 * no mobile network-error frame, and §20 forbids inventing one. Both follow the
 * shared responsive rule (`634:119`) — the same card, the same copy, the mobile
 * type sizes.
 *
 * ### Why the authorized payload is a type parameter
 *
 * `APP4-D01` drew these frames as *access* states, and `APP5-D01` deliberately
 * reuses them rather than redrawing them (`FIG-APP5-MATRIX-STATUS`, `674:3`):
 * APP5 fills the authorized slot with a request, it does not redesign the
 * security shell. The three unauthorized states are therefore identical for
 * every consumer, and the only thing that varies is what a successful call
 * returned. Making that a parameter is what lets the security machinery stay
 * one implementation instead of two that could disagree about when a credential
 * dies.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export type SecureLinkStatus = 'BOOTSTRAP' | 'AUTHORIZED' | 'UNAVAILABLE' | 'TRANSIENT_ERROR';

/**
 * A settled landing, with the authorized payload present only when authorized.
 *
 * Modelled as a discriminated union rather than as an optional field, so a
 * consumer cannot read the payload out of a state that never had one — the
 * unavailable and transient screens are the two that must render *nothing*
 * about the target, and this makes that a compile error rather than a habit.
 */
export type SecureLinkState<TPayload> =
  | { readonly status: 'BOOTSTRAP' }
  | { readonly status: 'AUTHORIZED'; readonly payload: TPayload }
  | { readonly status: 'UNAVAILABLE' }
  | { readonly status: 'TRANSIENT_ERROR' };

export const initialSecureLinkState = { status: 'BOOTSTRAP' } as const;

export type SecureLinkAction<TPayload> =
  { type: 'RESOLVED'; payload: TPayload } | { type: 'UNAVAILABLE' } | { type: 'TRANSIENT_FAILURE' };

export function secureLinkReducer<TPayload>(
  state: SecureLinkState<TPayload>,
  action: SecureLinkAction<TPayload>,
): SecureLinkState<TPayload> {
  switch (action.type) {
    case 'RESOLVED':
      return { status: 'AUTHORIZED', payload: action.payload };
    case 'UNAVAILABLE':
      // No cause is carried, because none is known and none may be shown. The
      // server collapsed six causes into one 404 (`APP4-G01` PO-04); a client
      // that stored a reason here would be inventing one.
      return { status: 'UNAVAILABLE' };
    case 'TRANSIENT_FAILURE':
      return { status: 'TRANSIENT_ERROR' };
    default:
      return state;
  }
}

/** What a failed call means for the customer. */
export type SecureLinkOutcome = 'UNAVAILABLE' | 'TRANSIENT';

/**
 * Splits a refusal into "the link does not open" and "we never found out".
 *
 * The split is not cosmetic. An unavailable verdict is final and the credential
 * is destroyed; a transient failure carries **no verdict at all**, so
 * destroying it would turn a flaky network into a permanently dead link the
 * customer cannot retry (§8). The rule is therefore stated as: a transient
 * outcome is the *absence* of an answer, and everything else is an answer.
 *
 * - **No `httpStatus`** — `NETWORK_ERROR`, `REQUEST_TIMEOUT`,
 *   `UNEXPECTED_CLIENT_ERROR`. The request never reached a verdict.
 * - **`429`** — the request was refused before it was evaluated. The
 *   secure-link limiter counts requests and never outcomes, precisely so it
 *   cannot become a validity oracle (`APP4-G01` PO-12), which is exactly why a
 *   429 says nothing about the link. `APP5-B03` runs behind the same limiter.
 * - **`5xx`** — the server failed, not the link.
 * - **everything else, `404` included** — a definitive refusal. Mapped by status
 *   rather than by business code on purpose: the one published failure is
 *   `404 SECURE_LINK_UNAVAILABLE`, and a client that keyed on the code string
 *   would fall through to "transient" if that envelope were ever malformed —
 *   offering a retry loop against a link that will never open.
 */
export function secureLinkOutcomeOf(error: NormalizedApiError): SecureLinkOutcome {
  const status = error.httpStatus;
  if (status === undefined) return 'TRANSIENT';
  if (status === 429) return 'TRANSIENT';
  if (status >= 500) return 'TRANSIENT';
  return 'UNAVAILABLE';
}
