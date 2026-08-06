/**
 * The bounded vocabulary of an anonymous Session authorization decision
 * (`IMP-D043` PO-01/PO-05, `APP3-B06A`).
 *
 * There are two audiences and they are deliberately not the same. Internally a
 * refusal has a reason, because a metric or a test that cannot tell "no cookie"
 * from "wrong secret" cannot detect an attack or prove a rule. Externally there
 * is exactly **one** outcome, because every distinction is an oracle: "expired"
 * confirms the session existed, "no such session" confirms it did not, and an
 * attacker enumerating ids learns from either.
 *
 * So `DesignSessionAuthorizationReason` never leaves the process, and
 * `designSessionUnauthorized()` is the only thing a client ever sees.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Why authorization failed. Internal only — never serialized into a response,
 * a log field a client can read back, or an Audit payload.
 */
export const DESIGN_SESSION_AUTH_REASONS = [
  'MALFORMED_SESSION_ID',
  'COOKIE_MISSING',
  'COOKIE_AMBIGUOUS',
  'MALFORMED_SECRET',
  'SESSION_NOT_FOUND',
  'SECRET_MISMATCH',
  'SESSION_NOT_ACTIVE',
  'SESSION_EXPIRED',
] as const;

export type DesignSessionAuthorizationReason = (typeof DESIGN_SESSION_AUTH_REASONS)[number];

/**
 * The reasons that mean "this browser is holding a credential that will never
 * work again", and whose matching cookie is therefore cleared.
 *
 * `COOKIE_MISSING` is absent on purpose: there is nothing to clear, and
 * fabricating a `Set-Cookie` would tell a caller that the name it guessed was
 * the right one. `SESSION_NOT_FOUND` is absent for the same reason — the id may
 * simply be wrong, and clearing would confirm which.
 */
const CLEAR_COOKIE_REASONS: ReadonlySet<DesignSessionAuthorizationReason> = new Set([
  'MALFORMED_SECRET',
  'SECRET_MISMATCH',
  'SESSION_NOT_ACTIVE',
  'SESSION_EXPIRED',
  'COOKIE_AMBIGUOUS',
]);

export function clearsCookie(reason: DesignSessionAuthorizationReason): boolean {
  return CLEAR_COOKIE_REASONS.has(reason);
}

/**
 * The single public failure. One status, one code, one message, for every
 * reason above.
 */
export function designSessionUnauthorized(): HttpException {
  return new HttpException(
    { message: 'That design session could not be authorized.' },
    HttpStatus.UNAUTHORIZED,
  );
}

/** The Origin / Fetch Metadata refusal (PO-05). Distinct status, still reasonless. */
export function designSessionOriginRefused(): HttpException {
  return new HttpException(
    { message: 'This request origin is not allowed for design session changes.' },
    HttpStatus.FORBIDDEN,
  );
}

/** The PO-07 rate-limit refusal. Reveals no session existence. */
export function designSessionRateLimited(): HttpException {
  return new HttpException(
    { message: 'Too many design session requests. Please retry shortly.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * The PO-08 stale-write conflict.
 *
 * Carries no current revision: an authorization-adjacent failure that reported
 * the live revision would let an unauthorized caller poll for activity. The
 * revision a client needs comes from a successful read, not from a refusal.
 */
export function designSessionStaleWrite(): HttpException {
  return new HttpException(
    { message: 'This design session changed since you last loaded it.' },
    HttpStatus.CONFLICT,
  );
}
