/**
 * What a failed sellability read or write means, decided from the normalized
 * envelope and never from a message string.
 *
 * ### Why the business code is read and not only the status
 *
 * `APP12-N02.B01` and `APP7-B01` publish two different `409`s on the same
 * screen — `PRODUCT_VARIANT_DUPLICATE` and `SKU_ORDER_ELIGIBLE_AMBIGUOUS` — and
 * a third (`SKU_CODE_CONFLICT`) that reaches the operator through a completely
 * different field. Branching on the status alone would collapse three refusals
 * with three different repairs into one sentence that fits none of them. So the
 * code decides, and the status is the fallback for a code this build has never
 * seen.
 *
 * ### Why nothing here is retried automatically
 *
 * Every refusal in this module wrote nothing and will refuse the identical
 * request identically. The one genuinely unknown outcome — a lost response —
 * is classified `retryable`, and even that offers a **reload**, never a resend:
 * neither variant nor SKU authoring carries an idempotency key, and a blind
 * second `create` would be how a duplicate SKU gets made by the client rather
 * than refused by the server.
 *
 * Nothing in this module reads `normalized.message`.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;

/** The published business codes this feature branches on. */
export const VARIANT_LABEL_REQUIRED = 'VARIANT_LABEL_REQUIRED';
export const PRODUCT_VARIANT_DUPLICATE = 'PRODUCT_VARIANT_DUPLICATE';
export const VARIANT_PRODUCT_NOT_AUTHORABLE = 'VARIANT_PRODUCT_NOT_AUTHORABLE';
export const SKU_PRODUCT_NOT_AUTHORABLE = 'SKU_PRODUCT_NOT_AUTHORABLE';
export const SKU_ORDER_ELIGIBLE_AMBIGUOUS = 'SKU_ORDER_ELIGIBLE_AMBIGUOUS';
export const SKU_CODE_CONFLICT = 'SKU_CODE_CONFLICT';

/** The only error type this feature's services throw. */
export class SellabilityApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin sellability authoring API call failed.');
    this.name = 'SellabilityApiError';
    this.normalized = normalized;
  }
}

export function isSellabilityApiError(error: unknown): error is SellabilityApiError {
  return error instanceof SellabilityApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isSellabilityApiError(error) ? error.normalized : null;
}

/** Why the authoring list could not be shown. */
export type SellabilityReadFailure = 'missing' | 'unauthenticated' | 'forbidden' | 'retryable';

export function classifySellabilityReadFailure(error: unknown): SellabilityReadFailure {
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
      return 'retryable';
  }
}

/**
 * Why a variant or SKU write did not settle.
 *
 * `ambiguous` is deliberately **not** one of these. Unlike a stock adjustment,
 * every write here is followed by an authoritative refetch of the whole variant
 * list, so a lost response resolves itself the moment the list comes back — the
 * operator is shown the reload-and-look outcome (`retryable`) rather than a
 * warning about a write whose fate the screen is about to learn anyway.
 */
export type SellabilityWriteFailure =
  | 'labelRequired'
  | 'duplicate'
  | 'skuAmbiguous'
  | 'skuCodeConflict'
  | 'notAuthorable'
  | 'variantMissing'
  | 'skuMissing'
  | 'invalid'
  | 'unauthenticated'
  | 'forbidden'
  | 'retryable';

/**
 * The refused-write classifier.
 *
 * The `404` family collapses to two outcomes and no further: the contract's
 * `VARIANT_PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND` and
 * `VARIANT_PRODUCT_MISMATCH` all mean "this variant is not under this product
 * any more", which has exactly one repair — reload the list. Splitting them
 * would give the operator three sentences describing one action.
 */
export function classifySellabilityWriteFailure(
  error: unknown,
  kind: 'variant' | 'sku',
): SellabilityWriteFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  const { code, httpStatus } = normalized;

  // The code decides first, wherever the contract publishes one. Three of these
  // are 409s that share a status and share nothing else.
  switch (code) {
    case VARIANT_LABEL_REQUIRED:
      return 'labelRequired';
    case PRODUCT_VARIANT_DUPLICATE:
      return 'duplicate';
    case SKU_ORDER_ELIGIBLE_AMBIGUOUS:
      return 'skuAmbiguous';
    case SKU_CODE_CONFLICT:
      return 'skuCodeConflict';
    case VARIANT_PRODUCT_NOT_AUTHORABLE:
    case SKU_PRODUCT_NOT_AUTHORABLE:
      return 'notAuthorable';
    default:
      break;
  }

  if (httpStatus === undefined || httpStatus === 0) return 'retryable';
  switch (httpStatus) {
    case HTTP_NOT_FOUND:
      return kind === 'sku' ? 'skuMissing' : 'variantMissing';
    case HTTP_BAD_REQUEST:
      return 'invalid';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    case HTTP_CONFLICT:
      // A 409 whose code this build does not recognise. It is a refusal that
      // wrote nothing, but nothing here can say which one, so it reaches the
      // operator as the reload-and-look outcome rather than as a specific
      // repair that may be the wrong one.
      return 'retryable';
    default:
      return httpStatus >= HTTP_SERVER_ERROR ? 'retryable' : 'invalid';
  }
}

/**
 * Whether the operator's typed fields survive the refusal.
 *
 * They survive everything except a lost session, where the values would sit in
 * a dialog behind a screen the operator has to leave anyway. In particular they
 * survive `skuAmbiguous`: the staged SKU is not wrong — it merely cannot be
 * *active* yet — and discarding it would force the operator to retype a code
 * they had already decided on (`§12`, `976:269`).
 */
export function preservesStagedInput(failure: SellabilityWriteFailure): boolean {
  return failure !== 'unauthenticated';
}

/**
 * Whether the screen must re-read the authoritative list before the operator
 * acts again.
 *
 * True wherever the refusal was decided by state the dialog cannot see: a
 * duplicate variant that may merely be deactivated, a SKU already selling, a
 * row that has since moved, an unknown outcome. False for the two refusals the
 * operator fixes in the fields still in front of them.
 */
export function requiresAuthoritativeReload(failure: SellabilityWriteFailure): boolean {
  return failure !== 'labelRequired' && failure !== 'invalid' && failure !== 'unauthenticated';
}
