/**
 * The four states `/truy-cap` can be in, and the rule that maps a failure onto
 * one of them (`APP4-S02` §11–§15).
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
 */
import type { SecureLinkResolutionResponse } from '@embroidery/api-client';
import type { NormalizedApiError } from '@embroidery/api-client';

export type SecureLinkStatus = 'BOOTSTRAP' | 'AUTHORIZED' | 'UNAVAILABLE' | 'TRANSIENT_ERROR';

/**
 * The safe facts a resolved grant may put on screen.
 *
 * Exactly the three fields `SecureLinkResolutionResponse` publishes. The
 * authorized shell renders no customer, no request detail, no quotation, no
 * design and no commercial status, because B06 returns none of those and APP4
 * owns none of them (§12).
 */
export type SecureLinkGrant = Readonly<SecureLinkResolutionResponse>;

export interface SecureLinkState {
  readonly status: SecureLinkStatus;
  /** Present only in `AUTHORIZED`. */
  readonly grant?: SecureLinkGrant;
}

export const initialSecureLinkState: SecureLinkState = { status: 'BOOTSTRAP' };

export type SecureLinkAction =
  | { type: 'RESOLVED'; grant: SecureLinkGrant }
  | { type: 'UNAVAILABLE' }
  | { type: 'TRANSIENT_FAILURE' };

export function secureLinkReducer(
  state: SecureLinkState,
  action: SecureLinkAction,
): SecureLinkState {
  switch (action.type) {
    case 'RESOLVED':
      return { status: 'AUTHORIZED', grant: action.grant };
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

/** What a failed resolve means for the customer. */
export type SecureLinkOutcome = 'UNAVAILABLE' | 'TRANSIENT';

/**
 * Splits a refusal into "the link does not open" and "we never found out".
 *
 * The split is not cosmetic. An unavailable verdict is final and the token is
 * destroyed; a transient failure carries **no verdict at all**, so destroying
 * the token would turn a flaky network into a permanently dead link the
 * customer cannot retry (§8). The rule is therefore stated as: a transient
 * outcome is the *absence* of an answer, and everything else is an answer.
 *
 * - **No `httpStatus`** — `NETWORK_ERROR`, `REQUEST_TIMEOUT`,
 *   `UNEXPECTED_CLIENT_ERROR`. The request never reached a verdict.
 * - **`429`** — the request was refused before it was evaluated. B06 rate-limits
 *   by request count and never by outcome, precisely so the limiter cannot
 *   become a token-validity oracle (`APP4-G01` PO-12), which is exactly why a
 *   429 says nothing about the token.
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
