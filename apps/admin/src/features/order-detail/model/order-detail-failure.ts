/**
 * What a failed order or payment operation means, decided from the normalized
 * envelope and never from a message string.
 *
 * ### Three classifiers, because three surfaces fail differently
 *
 * - **a read** either produced the order or did not;
 * - **one evidence image** may fail on its own without the page failing, and its
 *   404 has a consequence no other failure has;
 * - **a payment decision** may be refused for what the operator typed, because
 *   the attempt moved underneath them, or — the case that matters most —
 *   ambiguously, with no answer at all.
 *
 * ### The evidence classifier reads the status and never the code
 *
 * `APP7-B06` is a `responseType: 'blob'` call, so a failed response body arrives
 * as a `Blob` rather than as the JSON envelope. `normalizeApiClientError` cannot
 * parse it and falls back to a generic classification — but it still carries
 * `httpStatus`, because Axios reports that from the response line. The HTTP
 * status is therefore the *only* trustworthy discriminator on this path, and a
 * classifier that matched a business `code` here would silently classify every
 * real failure as generic. (`APP7-B06` also states that its feature code never
 * reaches the wire on a 5xx: the platform replaces the code and message of every
 * 5xx with a generic pair, so the status is all there is.)
 *
 * Nothing in this module reads `normalized.message`.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** The only error type this feature's services throw. */
export class OrderDetailApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin order detail API call failed.');
    this.name = 'OrderDetailApiError';
    this.normalized = normalized;
  }
}

export function isOrderDetailApiError(error: unknown): error is OrderDetailApiError {
  return error instanceof OrderDetailApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isOrderDetailApiError(error) ? error.normalized : null;
}

/**
 * Why the order could not be shown.
 *
 * `missing` covers 404, 403 and 400 as one outcome. The screen must not
 * distinguish "no such order" from "not yours to read" — that difference is
 * precisely what tells an unauthorized caller an order id is real — and a
 * malformed id is a route reached through a bad link that the server will keep
 * refusing, so a retry could not help it either.
 */
export type OrderReadFailure = 'missing' | 'unauthenticated' | 'retryable';

export function classifyOrderReadFailure(error: unknown): OrderReadFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
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
 * `unavailable` is `APP7-B06`'s 404: ten distinct refusals collapse into one
 * indistinguishable answer, so the screen cannot and must not say which. It has
 * one consequence the other failures do not — `previewEligible` may now be
 * stale, so the caller re-reads the payment metadata. It is still terminal for
 * *this* image and offers no retry: the association, the upload lane, the
 * inspection verdict and the tombstone are all re-proved server-side on every
 * request, so a refusal will be refused again.
 *
 * `temporary` is the 503 band — provider absence or a byte-count contradiction,
 * both of which `APP7-B06` deliberately answers with 503 rather than 404 because
 * by then the association exists and the row says `ACCEPTED`. One manual attempt
 * can genuinely succeed.
 *
 * The 401 is deliberately not collapsed into either: `APP7-B06` refuses to show
 * an operator whose session died a missing-evidence answer, and neither does
 * this screen.
 */
export type EvidenceFailure = 'unavailable' | 'temporary' | 'unauthenticated' | 'retryable';

export function classifyEvidenceFailure(error: unknown): EvidenceFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  const status = normalized.httpStatus;
  if (status === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (status === HTTP_NOT_FOUND || status === HTTP_FORBIDDEN || status === HTTP_BAD_REQUEST) {
    return 'unavailable';
  }
  if (status === HTTP_SERVICE_UNAVAILABLE) return 'temporary';
  return 'retryable';
}

/**
 * Why a payment decision did not settle.
 *
 * `ambiguous` is the one that changes behaviour rather than only wording. It is
 * the case `741:51` is written about: the transport failed without an HTTP
 * status, so the server may have committed the write and lost the response on
 * the way back. The client has no way to know, and concluding failure would be
 * the single worst thing this screen could do — so `ambiguous` triggers a
 * re-read of the current truth instead of an error.
 *
 * `stale` is `741:87`: another operator wrote first, or the attempt left the
 * state the decision was judged against. The response is a re-read and a fresh
 * decision on the reloaded data — never a resubmit of the same payload.
 *
 * `invalid` keeps the operator's text: the command was judged against the right
 * state and the *body* was wrong, which is something they can fix in the dialog.
 */
export type PaymentDecisionFailure =
  'ambiguous' | 'stale' | 'invalid' | 'unauthenticated' | 'missing' | 'retryable';

export function classifyPaymentDecisionFailure(error: unknown): PaymentDecisionFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'ambiguous';
  const status = normalized.httpStatus;
  // No response line at all — a dropped connection, a timeout, an aborted
  // request. The server's answer is unknown, not negative.
  if (status === undefined || status === 0) return 'ambiguous';
  switch (status) {
    case HTTP_CONFLICT:
      return 'stale';
    case HTTP_BAD_REQUEST:
    case HTTP_UNPROCESSABLE:
      return 'invalid';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
      return 'missing';
    default:
      // Every 5xx lands here. A server error is *not* proof the write did not
      // happen — the platform replaces a 5xx code and message with a generic
      // pair, so there is nothing left to distinguish "refused" from "committed
      // then failed to answer". It is reconciled, not reported as a failure.
      return status >= 500 ? 'ambiguous' : 'retryable';
  }
}

/**
 * Whether a failed decision leaves the screen not knowing the current truth —
 * the only condition under which the payment read is re-fetched after a failure,
 * and never a reason to send anything again.
 */
export function requiresPaymentReload(failure: PaymentDecisionFailure): boolean {
  return failure === 'ambiguous' || failure === 'stale' || failure === 'missing';
}

/**
 * Whether the operator's typed text survives the failure.
 *
 * A transport-band or validation failure keeps the dialog fields intact so
 * nothing has to be retyped, and `741:82` requires it for the ambiguous case in
 * particular: the recovery is re-sending *exactly the same values*, which
 * `APP7-B04` converges on with `replayed: true`. A stale conflict does not keep
 * them: the values were written about a state the attempt has left.
 */
export function preservesEnteredFields(failure: PaymentDecisionFailure): boolean {
  return failure === 'invalid' || failure === 'retryable' || failure === 'ambiguous';
}
