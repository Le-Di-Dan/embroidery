/**
 * What a failed lifecycle command means, decided from the transport contract and
 * nothing else.
 *
 * The classification uses the **HTTP status** only. That is not a shortcut — it
 * is what the wire actually publishes. `APP3-B04`/`B04A` raise their refusals as
 * `ConflictException(message)` and `UnprocessableEntityException(message)` with
 * a *string* payload, and the platform mapper promotes a feature's own code only
 * when the payload is a record carrying one. So every lifecycle 409 arrives as
 * `CONFLICT` and every publish refusal as `UNPROCESSABLE_ENTITY`: the internal
 * `PublicationRefusal` vocabulary (`SCOPE_UNRESOLVED`, `MEDIA_INELIGIBLE`, …) is
 * captured in the server-side error object and discarded at the HTTP boundary.
 *
 * `FU-APP3-CONFLICT-CODE-CONTRACT-01` remains open for exactly this. Until it is
 * resolved there is no per-guard discriminator to map, so this module refuses to
 * invent one — no branching on `message`, no English wording, no guess about
 * which of the seven conditions the server rejected.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

/** The error every lifecycle service failure leaves this feature as. */
export class TemplateLifecycleApiError extends Error {
  constructor(readonly normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = 'TemplateLifecycleApiError';
  }
}

export function isLifecycleApiError(value: unknown): value is TemplateLifecycleApiError {
  return value instanceof TemplateLifecycleApiError;
}

/**
 * - `stale-state` — the command was refused because the Template moved. The
 *   *only* correct response is an authoritative re-read; never a replay.
 * - `not-ready` — publish ran the guard and the Template failed it. The server
 *   changed nothing.
 * - `rejected` — the request itself was malformed (a reason the server would not
 *   accept). Fixable in the dialog without re-reading.
 * - `unauthenticated` — the Admin session is gone.
 * - `missing` — the Template no longer exists.
 * - `generic` — anything else, reported without detail.
 */
export type LifecycleFailure =
  'stale-state' | 'not-ready' | 'rejected' | 'unauthenticated' | 'missing' | 'generic';

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isLifecycleApiError(error) ? error.normalized : null;
}

export function classifyLifecycleFailure(error: unknown): LifecycleFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      return 'stale-state';
    case HTTP_UNPROCESSABLE:
      return 'not-ready';
    case HTTP_BAD_REQUEST:
      return 'rejected';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_NOT_FOUND:
      return 'missing';
    default:
      return 'generic';
  }
}

/**
 * Whether a failure obliges an authoritative re-read.
 *
 * Only the conflict does. A publish refusal must **not** trigger one: `APP3-B04`
 * guarantees the guard is read-only and writes nothing, so re-reading would
 * discard a perfectly current cache entry and imply to the operator that
 * something moved when nothing did.
 */
export function requiresAuthoritativeReread(failure: LifecycleFailure): boolean {
  return failure === 'stale-state';
}
