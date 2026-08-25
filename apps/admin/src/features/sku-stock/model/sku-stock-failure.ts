/**
 * What a failed inventory read or adjustment means, decided from the normalized
 * envelope and never from a message string.
 *
 * ### Two classifiers, because a read and a write fail differently
 *
 * A **read** either produced the stock record or did not. A **write** has one
 * outcome a read can never have: it may have committed and lost its answer on
 * the way back, which is the only case where the client must not conclude
 * anything at all.
 *
 * ### The 404 is named, not collapsed
 *
 * `APP7`'s order surface deliberately folds 404/403/400 into one
 * indistinguishable "missing", because telling an unauthorized caller that an
 * order id is real is itself the leak. Inventory is different: every route here
 * is behind `AuthenticatedAdminGuard`, the caller is already a staff session,
 * and `APP8-B01` publishes `INVENTORY_SKU_NOT_FOUND` precisely so an operator
 * learns the SKU does not exist rather than being told the server broke. The
 * approved refusal catalog (`787:110`) names it, so this screen names it.
 *
 * `403` is kept separate from `404` for the same reason `787:134` keeps it:
 * a foreign-origin write is a real, differently-actionable answer.
 *
 * Nothing in this module reads `normalized.message` — the server's sanitised
 * prose is not a branch condition and is never rendered as the only copy.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;

/** The published business code the negative-stock refusal travels under. */
export const INVENTORY_STOCK_WOULD_GO_NEGATIVE = 'INVENTORY_STOCK_WOULD_GO_NEGATIVE';

/** The only error type this feature's services throw. */
export class SkuStockApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin SKU stock API call failed.');
    this.name = 'SkuStockApiError';
    this.normalized = normalized;
  }
}

export function isSkuStockApiError(error: unknown): error is SkuStockApiError {
  return error instanceof SkuStockApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isSkuStockApiError(error) ? error.normalized : null;
}

/** Why the stock record or the ledger could not be shown. */
export type StockReadFailure = 'missing' | 'unauthenticated' | 'forbidden' | 'retryable';

export function classifyStockReadFailure(error: unknown): StockReadFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_NOT_FOUND:
      return 'missing';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    default:
      // A malformed id in the URL is the Zod pipe's 400. It is not "missing" —
      // the SKU may well exist — but it is not retryable either, because the
      // same id will be refused again. It reaches the operator as the generic
      // failure, which is the only honest thing this screen can say about it.
      return 'retryable';
  }
}

/**
 * Why an adjustment did not settle.
 *
 * `ambiguous` is the case `777:75` is written about: the transport failed with
 * no HTTP status, so the server may have applied the delta and appended the
 * ledger row before losing the response. Concluding failure would invite a
 * second adjustment against stock that already moved — the single worst thing
 * this dialog could do — so `ambiguous` re-reads the authoritative truth and
 * offers no resubmit. There is no idempotency key on this operation and
 * `APP8-B01` publishes none, which is exactly why a resend is not offered.
 *
 * `negativeStock` is the `409` from `787:104`. It is a refusal that wrote
 * nothing, not a transient conflict, and it never triggers a retry: the design
 * (`FIG-APP8-STALE-CONFLICT-SPEC`, `787:149`) forbids an automatic-retry flow
 * for a code the contract does not have.
 *
 * `invalid` is the body-shaped `400`, kept apart because it is something the
 * operator can fix in the fields they still have in front of them.
 */
export type StockAdjustmentFailure =
  | 'negativeStock'
  | 'invalid'
  | 'missing'
  | 'unauthenticated'
  | 'forbidden'
  | 'ambiguous'
  | 'server';

export function classifyStockAdjustmentFailure(error: unknown): StockAdjustmentFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'ambiguous';
  const status = normalized.httpStatus;
  // No response line at all — a dropped connection, a timeout, an aborted
  // request. The server's answer is unknown, not negative.
  if (status === undefined || status === 0) return 'ambiguous';
  switch (status) {
    case HTTP_CONFLICT:
      // The only 409 this operation publishes. Branching on the code as well as
      // the status keeps an unforeseen future 409 out of the negative-stock
      // wording, which states a specific arithmetic fact.
      return normalized.code === INVENTORY_STOCK_WOULD_GO_NEGATIVE ? 'negativeStock' : 'server';
    case HTTP_BAD_REQUEST:
      return 'invalid';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    case HTTP_NOT_FOUND:
      return 'missing';
    default:
      // Every 5xx lands here. The platform replaces a 5xx code and message with
      // a generic pair, so nothing distinguishes "refused" from "committed then
      // failed to answer" — it is treated as unknown, not as a failure.
      return status >= HTTP_SERVER_ERROR ? 'ambiguous' : 'server';
  }
}

/**
 * Whether the screen no longer knows the current stock truth after a failed
 * adjustment — the only condition under which the reads are re-issued, and
 * never a reason to send the adjustment again.
 *
 * A negative-stock refusal is included: it is answered with the *current*
 * on-hand figure, and quoting a figure the dialog was opened with would state
 * an arithmetic fact that may already be stale.
 */
export function requiresStockReload(failure: StockAdjustmentFailure): boolean {
  return failure === 'ambiguous' || failure === 'negativeStock' || failure === 'missing';
}

/**
 * Whether the operator's typed delta and reason survive the failure.
 *
 * They survive everything except a lost session, where the values would sit in
 * a dialog behind a screen the operator has to leave anyway. In particular they
 * survive the negative-stock refusal: `777:99` keeps both fields on screen and
 * offers "Sửa chênh lệch", because the delta is not wrong — it is too large,
 * and only the operator may decide by how much. Nothing is clamped for them.
 */
export function preservesEnteredFields(failure: StockAdjustmentFailure): boolean {
  return failure !== 'unauthenticated';
}
