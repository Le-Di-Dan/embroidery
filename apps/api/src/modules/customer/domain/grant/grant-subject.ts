/**
 * Narrowing a resolved grant to the scope a surface actually serves
 * (`APP12-B04`).
 *
 * `APP12-DB01` gave `secure_access_grants` a second scope, so
 * {@link SecureAccessGrant} carries two nullable subjects under a typed XOR
 * (`ck_secure_access_grants__scope_subject`). Every delivered consumer was
 * written when `REQUEST_ACCESS` was the only scope and reads
 * `grant.customRequestId` as a certainty. Widening that field to
 * `string | undefined` makes the compiler ask each of them what it wants to do
 * about the other scope — and these two functions are the one answer, in one
 * place, rather than a `?? ''`, a `!` or an `as string` repeated at every call
 * site.
 *
 * ## The refusal is the delivered one, deliberately
 *
 * A `REQUEST_ACCESS` surface handed an `ORDER_ACCESS` token throws the same
 * `SECURE_LINK_UNAVAILABLE` an unknown token throws — same status, same code,
 * same message, same shape. `secure-link.errors.ts` names "wrong scope" among
 * the six causes that must stay indistinguishable, and this is that rule
 * applied to the case where the scope is now genuinely possible rather than
 * theoretical. A `WRONG_SCOPE` code here would tell a probe that the token was
 * real and only pointed somewhere else.
 *
 * ## Why a throw and not a boolean
 *
 * Every caller's only correct response to the wrong scope is to refuse, and a
 * predicate would leave the refusal to be written — and eventually forgotten —
 * at each site. The functions return the subject so the narrowing and the guard
 * are the same expression: there is no way to obtain the id without having
 * passed the check.
 */
import type { GrantScopeKind } from '@embroidery/database';

import { secureLinkUnavailable } from './secure-link.errors';

/**
 * The shape both narrowers accept.
 *
 * Structural rather than `SecureAccessGrant`, so the same two functions serve
 * the locked grant row *and* `ResolvedSecureLink` — the read-side projection of
 * it. Those are two types by design (one carries the customer id, the other
 * deliberately does not), and duplicating the narrowing for each would be two
 * places for the scope check to drift.
 */
export interface ScopedSubject {
  readonly scopeKind: GrantScopeKind;
  readonly customRequestId: string | undefined;
  readonly orderId: string | undefined;
}

/** The two scopes, as values a query may be pinned to. Never caller-supplied. */
export const REQUEST_ACCESS_SCOPE = 'REQUEST_ACCESS' as const;
export const ORDER_ACCESS_SCOPE = 'ORDER_ACCESS' as const;

/**
 * The custom request a `REQUEST_ACCESS` grant opens.
 *
 * Refuses an `ORDER_ACCESS` grant, and refuses a `REQUEST_ACCESS` row whose
 * subject is somehow absent — which the CHECK makes impossible, so reaching it
 * means the row and the constraint disagree and acting on it would be worse
 * than refusing.
 */
export function requestSubjectOf(grant: ScopedSubject): string {
  if (grant.scopeKind !== REQUEST_ACCESS_SCOPE || grant.customRequestId === undefined) {
    throw secureLinkUnavailable();
  }
  return grant.customRequestId;
}

/** The order an `ORDER_ACCESS` grant opens, on the same terms. */
export function orderSubjectOf(grant: ScopedSubject): string {
  if (grant.scopeKind !== ORDER_ACCESS_SCOPE || grant.orderId === undefined) {
    throw secureLinkUnavailable();
  }
  return grant.orderId;
}
