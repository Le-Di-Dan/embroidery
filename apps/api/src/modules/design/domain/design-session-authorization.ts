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

/**
 * The single bootstrap refusal (`APP3-B07`).
 *
 * An unpublished Product, a Studio-ineligible one, an unknown Side code, a
 * retired Area, a draft Template, a Template scoped elsewhere and a document
 * that fails validation are all one answer: this placement cannot open a
 * session. Separating them would let an anonymous caller map the catalog by
 * watching which refusal it gets — including rows publication deliberately
 * hides.
 */
export function designSessionBootstrapRefused(): HttpException {
  return new HttpException(
    { message: 'A design session cannot be opened for that selection.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
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
/**
 * The single autosave document refusal (`APP3-B08`).
 *
 * A malformed document, one that is too complex, one whose placement snapshot
 * disagrees with the live Side and Area, one that leaves the embroidery area,
 * and one referencing media this session may not place are all one answer.
 * Naming which rule failed would turn the endpoint into an oracle: a caller
 * could learn a session's placement geometry and probe which Asset ids exist by
 * watching the reason change. 422, because the request is well formed and the
 * document is what cannot be accepted.
 */
export function designSessionDocumentRefused(): HttpException {
  return new HttpException(
    { message: 'That design document cannot be saved for this session.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function designSessionStaleWrite(): HttpException {
  return new HttpException(
    { message: 'This design session changed since you last loaded it.' },
    HttpStatus.CONFLICT,
  );
}
