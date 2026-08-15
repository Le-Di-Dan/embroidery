/**
 * What a failed support operation means, decided from the normalized envelope
 * and never from a message string.
 *
 * Two different discriminators, because the backend publishes two different
 * things and pretending otherwise would be a guess:
 *
 * - **The replay conflicts carry a stable business code.** `APP4-B08` raises them
 *   as `HttpException({ code, message }, CONFLICT)`, and the platform mapper
 *   promotes a feature's own `code` when the payload is a record carrying one. So
 *   `REISSUE_REQUIRED`, `REPLAY_NOT_APPLICABLE` and `REPLAY_SOURCE_UNAVAILABLE`
 *   arrive intact and are matched by name. They mean genuinely different things —
 *   only the first one means "issue a new credential" — so collapsing them would
 *   tell an operator to mint a secret for a customer who does not need one.
 * - **The revoke conflict carries no code.** `APP4-B07` raises it as
 *   `HttpException({ message }, CONFLICT)` with no `code` field, so the envelope
 *   falls back to the status-derived default. It is therefore matched on the
 *   **409 status**, which is what the wire actually publishes — not on the word
 *   "active" appearing in a sentence.
 *
 * Nothing here reads `normalized.message`. It exists to be rendered when we have
 * nothing better, and it is the one field whose wording is free to change.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** The error every customer-access service failure leaves this feature as. */
export class CustomerAccessApiError extends Error {
  constructor(readonly normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = 'CustomerAccessApiError';
  }
}

export function isCustomerAccessApiError(value: unknown): value is CustomerAccessApiError {
  return value instanceof CustomerAccessApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isCustomerAccessApiError(error) ? error.normalized : null;
}

/**
 * Why a lookup produced no Customer.
 *
 * `not-found` is deliberately one outcome and not four. The server answers the
 * same 404 for unknown, unverified, deactivated and malformed precisely so the
 * screen cannot report which — and a client that split them here would be
 * reconstructing the enumeration oracle the API refuses to be.
 */
export type LookupFailure = 'not-found' | 'unauthenticated' | 'forbidden' | 'generic';

export function classifyLookupFailure(error: unknown): LookupFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  switch (normalized.httpStatus) {
    // A rejected body reaches the operator as the same "no match" answer: the
    // server refuses to distinguish malformed from unknown, and a client that
    // showed "invalid format" would leak that distinction back.
    case HTTP_NOT_FOUND:
    case HTTP_BAD_REQUEST:
      return 'not-found';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    default:
      return 'generic';
  }
}

/**
 * - `conflict` — the grant is no longer ACTIVE, so there is nothing left to kill.
 *   The screen re-reads and shows the canonical current state.
 * - `missing` — no such grant.
 */
export type RevokeFailure = 'conflict' | 'missing' | 'unauthenticated' | 'generic';

export function classifyRevokeFailure(error: unknown): RevokeFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      return 'conflict';
    case HTTP_NOT_FOUND:
      return 'missing';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'generic';
  }
}

/**
 * - `reissue-required` — the secret behind the notification is no longer
 *   deliverable. A transport replay cannot help; a fresh one must be issued
 *   through the *business* flow, which this screen does not and must not run.
 * - `not-applicable` — the notification did not fail, so there is nothing to
 *   replay. Not a secret problem.
 * - `source-unavailable` — there is no single dead-lettered delivery to replay
 *   from. A persistence problem, not an expired credential.
 */
export type ReplayFailure =
  | 'reissue-required'
  | 'not-applicable'
  | 'source-unavailable'
  | 'missing'
  | 'unauthenticated'
  | 'generic';

/** The exact business codes `APP4-B08` publishes. Matched by name, never parsed. */
const REPLAY_CODES: Readonly<Record<string, ReplayFailure>> = {
  REISSUE_REQUIRED: 'reissue-required',
  REPLAY_NOT_APPLICABLE: 'not-applicable',
  REPLAY_SOURCE_UNAVAILABLE: 'source-unavailable',
};

export function classifyReplayFailure(error: unknown): ReplayFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';

  const byCode = REPLAY_CODES[normalized.code];
  if (byCode !== undefined) return byCode;

  switch (normalized.httpStatus) {
    case HTTP_NOT_FOUND:
      return 'missing';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'generic';
  }
}

/**
 * Whether a replay refusal means the operator must go and issue a new credential.
 *
 * Exactly one of them does. This predicate exists so the screen asks the
 * question once, by name, instead of every caller re-deriving it — and so a
 * fourth failure added later cannot silently inherit the hand-off.
 */
export function requiresBusinessReissue(failure: ReplayFailure): boolean {
  return failure === 'reissue-required';
}
