/**
 * Whether a grant is still live, and how to say so truthfully.
 *
 * `APP4-B07` publishes the **persisted** status and warns that it is not the
 * whole answer: expiry is enforced on every use rather than by a background
 * sweep, so a row can read `ACTIVE` long after its `expiresAt` has passed and
 * still open nothing. `ACTIVE` **and** a future `expiresAt` is the only
 * combination that is live.
 *
 * So this module derives a *display* state from the pair, and does it here
 * rather than in a component because two regions ask the same question — the
 * grant card, which labels the row, and the revoke action, which decides whether
 * it may be offered.
 *
 * What it deliberately does **not** do is invent a persisted `EXPIRED`. The
 * stale row is reported as expired to the operator, who needs the truth about
 * the link, while `status` keeps saying `ACTIVE`, which is the truth about the
 * database. `APP4-A01` §12 requires exactly that distinction, and a client that
 * rewrote the status would be a second lifecycle authority disagreeing with the
 * row an operator finds when they look.
 */
import type { AdminSecureGrantResponse } from '@embroidery/api-client';

/**
 * - `live` — stored ACTIVE and not yet past `expiresAt`. The only revocable one.
 * - `expired-by-time` — stored ACTIVE but past `expiresAt`. Opens nothing, and
 *   revoking it is a conflict the server will refuse, so the action is withheld.
 * - `expired` — stored EXPIRED.
 * - `revoked` — stored REVOKED.
 */
export type GrantLiveness = 'live' | 'expired-by-time' | 'expired' | 'revoked';

export function resolveGrantLiveness(grant: AdminSecureGrantResponse, now: Date): GrantLiveness {
  if (grant.status === 'REVOKED') return 'revoked';
  if (grant.status === 'EXPIRED') return 'expired';
  return Date.parse(grant.expiresAt) > now.getTime() ? 'live' : 'expired-by-time';
}

/** Only a genuinely live grant may be offered for revocation. */
export function isRevocable(liveness: GrantLiveness): boolean {
  return liveness === 'live';
}

/**
 * The grant the screen leads with.
 *
 * B07 returns every grant newest first, whatever its state, because a revoked or
 * expired one is exactly what explains a link that stopped working. The card
 * shows one, and the one worth showing is the live grant if there is one —
 * otherwise the most recent, which is the last thing that happened to this
 * Customer's access.
 */
export function selectPrimaryGrant(
  grants: readonly AdminSecureGrantResponse[],
  now: Date,
): AdminSecureGrantResponse | null {
  const live = grants.find((grant) => resolveGrantLiveness(grant, now) === 'live');
  return live ?? grants[0] ?? null;
}
