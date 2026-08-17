/**
 * What a failed request-detail operation means, decided from the normalized
 * envelope and never from a message string.
 *
 * ### Three classifiers, because three surfaces fail differently
 *
 * - **the detail read** either produced a request or did not;
 * - **one evidence image** may fail on its own without the page failing;
 * - **a moderation command** may be refused for what the operator typed, or
 *   because the request moved underneath them.
 *
 * ### The evidence classifier reads the status and never the code
 *
 * `APP5-B06` is a `responseType: 'blob'` call, so a failed response body arrives
 * as a `Blob` rather than as the JSON envelope. `normalizeApiClientError` cannot
 * parse it and falls back to `MALFORMED_RESPONSE` — but it still carries
 * `httpStatus`, because Axios reports that from the response line. So the HTTP
 * status is the *only* trustworthy discriminator on this path, and a classifier
 * that matched a business `code` here would silently classify every real failure
 * as generic.
 *
 * Nothing in this module reads `normalized.message`.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** The only error type this feature's services throw. */
export class CustomRequestDetailApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin custom-request detail API call failed.');
    this.name = 'CustomRequestDetailApiError';
    this.normalized = normalized;
  }
}

export function isCustomRequestDetailApiError(
  error: unknown,
): error is CustomRequestDetailApiError {
  return error instanceof CustomRequestDetailApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isCustomRequestDetailApiError(error) ? error.normalized : null;
}

/**
 * Why the detail could not be shown.
 *
 * `missing` covers 404 **and** 403 as one outcome. `APP5-B04` answers 404 for a
 * request that does not exist, and the screen must not distinguish "no such
 * request" from "not yours to read" — that difference is precisely what tells an
 * unauthorized caller a request id is real.
 */
export type DetailFailure = 'missing' | 'unauthenticated' | 'retryable';

export function classifyDetailFailure(error: unknown): DetailFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    // A malformed id is a route the operator reached with a bad link. The
    // server will keep refusing it, so `400` joins `404`/`403` as unavailable
    // rather than as something a retry could fix.
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
    case HTTP_BAD_REQUEST:
      return 'missing';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'retryable';
  }
}

/**
 * Why one evidence image could not be shown.
 *
 * `unavailable` is terminal and offers no retry: the association, the role, the
 * inspection verdict and the tombstone are all re-checked server-side on every
 * request, so a refusal will be refused again. `retryable` is the transport and
 * dependency band, where one manual attempt can genuinely succeed.
 */
export type EvidenceFailure = 'unavailable' | 'unauthenticated' | 'retryable';

export function classifyEvidenceFailure(error: unknown): EvidenceFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  const status = normalized.httpStatus;
  if (status === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (status === HTTP_NOT_FOUND || status === HTTP_FORBIDDEN || status === HTTP_BAD_REQUEST) {
    return 'unavailable';
  }
  return 'retryable';
}

/**
 * Why a moderation command was refused.
 *
 * `stale` is the outcome that changes the screen's behaviour rather than only
 * its wording: the request is not in the state the operator decided against, so
 * the detail is re-read and a **new** decision is required.
 *
 * Both of `APP5-B05`'s 409s land there. `REQUEST_TRANSITION_STALE` is the race
 * — someone moderated first — and `INVALID_TRANSITION` is its slower twin: the
 * move was legal when the screen rendered the button and is not legal now. The
 * operator's next step is identical in both cases, and the one thing that must
 * never happen in either is a resubmit of the same payload.
 *
 * The 400s stay `invalid`: the command was judged against the right state and
 * the *body* was wrong, which is something the operator can fix in the dialog.
 */
export type ModerationFailure = 'stale' | 'invalid' | 'unauthenticated' | 'missing' | 'retryable';

export function classifyModerationFailure(error: unknown): ModerationFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      return 'stale';
    case HTTP_BAD_REQUEST:
      return 'invalid';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
      return 'missing';
    default:
      return 'retryable';
  }
}

/**
 * Whether a failed command left the request in a state the screen no longer
 * knows — the only condition under which A02 re-reads `APP5-B04` after a
 * failure, and never a reason to send anything again.
 */
export function requiresDetailReload(failure: ModerationFailure): boolean {
  return failure === 'stale' || failure === 'missing';
}

/**
 * Whether the operator's typed text survives the failure.
 *
 * A transport failure keeps the dialog open with the fields intact so nothing
 * has to be retyped. A stale conflict does not: the words were written about a
 * state the request has left, and re-offering them is how a stale payload gets
 * resubmitted by muscle memory.
 */
export function preservesEnteredFields(failure: ModerationFailure): boolean {
  return failure === 'invalid' || failure === 'retryable';
}
