/**
 * Why an APP9 command was refused, decided from the normalized envelope's
 * business `code` and its HTTP status — never from a message string.
 *
 * ## Why this one reads `code`, when `order-detail-failure.ts` does not
 *
 * The APP7 classifiers deliberately read only `httpStatus`, because on that
 * surface every `409` means the same thing to an operator: someone wrote first,
 * re-read and decide again. APP9 is not like that. `adminOrder_dispatch` answers
 * `409` for three genuinely different situations — the order still owes money,
 * the shipping detail is not complete, the order is not in a dispatchable state
 * — and `adminOrderShipping_save` answers `409` for four. Collapsing them would
 * tell an operator to "reload and try again" when the truthful answer is that a
 * customer has not confirmed a higher shipping fee, which no amount of reloading
 * will change.
 *
 * So the discriminator is the code the API publishes for exactly this purpose.
 * The code is used to **select an approved Vietnamese sentence** and never
 * rendered; an unrecognised code falls through to the status band, and the
 * status band falls through to the generic sentence. Nothing here reads
 * `normalized.message`, so no English server text can reach the screen.
 *
 * ## A 5xx and a dead connection are not the same as a refusal
 *
 * Both leave `unknown`, and every mutation on this surface answers it by
 * re-reading the order rather than by reporting failure. Dispatch and completion
 * are single, non-idempotent state moves: concluding "it did not happen" when
 * the server may have committed and lost the response is how a screen ends up
 * offering to dispatch an order that has already shipped.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR = 500;

/** The only error type the APP9 service seam throws. */
export class OrderFulfillmentApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin order fulfillment API call failed.');
    this.name = 'OrderFulfillmentApiError';
    this.normalized = normalized;
  }
}

export function isOrderFulfillmentApiError(error: unknown): error is OrderFulfillmentApiError {
  return error instanceof OrderFulfillmentApiError;
}

/**
 * One classified outcome per approved refusal row in `820:47`, plus the three
 * bands every operation shares.
 */
export type FulfillmentFailure =
  | 'stale'
  | 'shipping-missing'
  | 'shipping-incomplete'
  | 'shipping-frozen'
  | 'fee-acknowledgement-required'
  | 'fee-change-unavailable'
  | 'fee-not-applicable'
  | 'remaining-missing'
  | 'payment-guard'
  | 'shipping-not-ready'
  | 'not-found'
  | 'unauthenticated'
  | 'unknown'
  | 'generic';

/**
 * The published codes, mapped to the sentence that answers each one.
 *
 * `ORDER_INVALID_TRANSITION` is `stale` on purpose and covers three of the
 * catalog's rows at once — a refused `TR-LC14-05`, a replayed dispatch and a
 * completion attempted before delivery. All three have the same honest answer:
 * the order is not where this screen thought it was, so reload. `820:100` says
 * so explicitly for the completion replay ("cùng một lời từ chối").
 */
const FAILURE_OF_CODE: Readonly<Record<string, FulfillmentFailure>> = {
  ORDER_INVALID_TRANSITION: 'stale',
  SHIPPING_DETAIL_NOT_FOUND: 'shipping-missing',
  SHIPPING_FROZEN: 'shipping-frozen',
  SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED: 'fee-acknowledgement-required',
  SHIPPING_FEE_CHANGE_NOT_AVAILABLE: 'fee-change-unavailable',
  SHIPPING_FEE_NOT_APPLICABLE: 'fee-not-applicable',
  ORDER_REMAINING_PAYMENT_MISSING: 'remaining-missing',
  ORDER_REMAINING_PAYMENT_UNSATISFIED: 'payment-guard',
  ORDER_SHIPPING_NOT_READY: 'shipping-not-ready',
  ORDER_NOT_FOUND: 'not-found',
};

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isOrderFulfillmentApiError(error) ? error.normalized : null;
}

export function classifyFulfillmentFailure(error: unknown): FulfillmentFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'unknown';

  const status = normalized.httpStatus;
  // No response line at all — a dropped connection, a timeout, an aborted
  // request. The server's answer is unknown, not negative.
  if (status === undefined || status === 0) return 'unknown';
  if (status >= HTTP_SERVER_ERROR) return 'unknown';

  const byCode = typeof normalized.code === 'string' ? FAILURE_OF_CODE[normalized.code] : undefined;
  if (byCode !== undefined) return byCode;

  switch (status) {
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
      return 'not-found';
    case HTTP_CONFLICT:
      return 'stale';
    case HTTP_BAD_REQUEST:
    case HTTP_UNPROCESSABLE:
      return 'shipping-incomplete';
    default:
      return 'generic';
  }
}

/**
 * Whether the screen must re-read the order because it no longer knows the
 * truth.
 *
 * `unknown` is the load-bearing one: the write may have committed. `stale` and
 * `not-found` mean another actor moved the order. A validation refusal is not
 * here — the operator's own input is what needs changing, and re-reading would
 * only throw their typing away.
 */
export function requiresOrderReload(failure: FulfillmentFailure): boolean {
  return failure === 'unknown' || failure === 'stale' || failure === 'not-found';
}

/**
 * Whether this refusal is the fee-acknowledgement one, which gets a card of its
 * own (`812:197`) rather than an inline sentence.
 *
 * It is the only refusal on the surface an operator cannot resolve by retrying,
 * correcting a field or reloading: the missing thing is a customer's consent,
 * and `APP9-B04-C1` forbids Admin from producing it.
 */
export function isFeeAcknowledgementRefusal(failure: FulfillmentFailure): boolean {
  return failure === 'fee-acknowledgement-required';
}
