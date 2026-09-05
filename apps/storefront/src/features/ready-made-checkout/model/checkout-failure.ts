import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { NormalizedApiError } from '@embroidery/api-client';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/checkout.json`, under `failure`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const failureMessage = messageView(VI_MESSAGES.checkout, 'failure');

/**
 * Turning an `APP12-B02` refusal into the approved `909:274` frame
 * (`APP12-S02` §27).
 *
 * ## Codes, not messages, and not statuses
 *
 * `APP12-B02` publishes five business codes in the standard error envelope, and
 * `normalizeApiClientError` lifts `code` out of it. Branching on that code is the
 * whole contract: the server's own `message` is English operator prose
 * ("There is not enough stock for that quantity."), it is not approved copy, and
 * §27 forbids rendering a backend string to a customer. The HTTP status is not
 * enough either — `409` covers two different outcomes with different remedies.
 *
 * ## Every unknown refusal is the unexpected outcome
 *
 * A code this module does not recognise — a `400` from the body validator, a
 * `429`, a proxy `502`, a transport failure — resolves to `UNEXPECTED`. It never
 * borrows the stock sentence, because "we could not reach the workshop" and
 * "that size just sold out" are different sentences and only one of them is ever
 * true. Nothing here inspects `fieldErrors` to compose a message from a field
 * path either: that would be a backend string reaching the customer by a longer
 * route.
 *
 * ## The two idempotency outcomes are kept apart
 *
 * `DUPLICATE_OPERATION` says another attempt on the same verified contact is
 * mid-flight and this one should simply be waited out; `IDEMPOTENCY_CONFLICT`
 * says the contact already placed a *different* order and cannot place this one.
 * Collapsing them would tell a customer whose click double-fired that they had
 * ordered something else.
 */

/** The refusal states the checkout can be in. Not a copy of the wire vocabulary. */
export type CheckoutFailure =
  /** `BR-022` — the SKU is not sellable right now, for any of the reasons B02 collapses. */
  | 'SKU_UNAVAILABLE'
  /** `BR-022` — sellable, but not this many units. */
  | 'INSUFFICIENT_STOCK'
  /** GRD-001 — the verification is gone, spent, or was never verified. */
  | 'VERIFICATION_REQUIRED'
  /** GRD-030 — this verified contact already placed a different order. */
  | 'ALREADY_ORDERED'
  /** GRD-012 — an attempt on this contact is in flight. Retryable as-is. */
  | 'IN_FLIGHT'
  /** The client-side shape the body validator refused. */
  | 'INVALID_DELIVERY'
  /** Anything else, including transport. */
  | 'UNEXPECTED';

/** `APP12-B02`'s published business codes — the only wire values consulted. */
const FAILURE_OF_CODE: Readonly<Record<string, CheckoutFailure>> = {
  SKU_NOT_AVAILABLE: 'SKU_UNAVAILABLE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  VERIFIED_CONTACT_REQUIRED: 'VERIFICATION_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'ALREADY_ORDERED',
  DUPLICATE_OPERATION: 'IN_FLIGHT',
};

/**
 * The transport code a refused body arrives as.
 *
 * `BAD_REQUEST`, not an invented `VALIDATION_ERROR`: `errorCodeForStatus` maps
 * every `400` — the global validation pipe's included — to that one stable
 * platform code, and `APP12-B02` declares no business code of its own for a
 * malformed body.
 */
const BAD_REQUEST_CODE = 'BAD_REQUEST';

export function checkoutFailureOf(error: NormalizedApiError): CheckoutFailure {
  const mapped = FAILURE_OF_CODE[error.code];
  if (mapped !== undefined) return mapped;
  if (error.code === BAD_REQUEST_CODE || error.httpStatus === 400) return 'INVALID_DELIVERY';
  return 'UNEXPECTED';
}

interface RefusalCopy {
  readonly title: string;
  readonly body: string;
  /** Whether the drawn `Quay lại sản phẩm` action is the way out (`909:281`). */
  readonly returnToProduct: boolean;
}

/**
 * The approved refusal text for each outcome (`909:274` … `909:280`).
 *
 * `INSUFFICIENT_STOCK` is the pair the frame spells out, transcribed exactly.
 * The frame's annotation (`909:276`) states the rule for the rest — *"Hàng vừa
 * hết hoặc SKU không còn bán được (`BR-022`). Nêu lý do và đưa khách về trang
 * sản phẩm; không thử lại ngầm."* — so each remaining outcome states its own
 * reason in that one drawn voice and offers the one drawn action. None of them
 * names a quantity, a stock level, an id or a state token, matching the refusal
 * discipline `APP12-B02` applies on its own side.
 */
const REFUSAL: Readonly<Record<CheckoutFailure, RefusalCopy>> = {
  INSUFFICIENT_STOCK: {
    // `909:279` / `909:280`, verbatim.
    title: failureMessage.text('INSUFFICIENT_STOCK.title'),
    body: failureMessage.text('INSUFFICIENT_STOCK.body'),
    returnToProduct: true,
  },
  SKU_UNAVAILABLE: {
    title: failureMessage.text('SKU_UNAVAILABLE.title'),
    body: failureMessage.text('SKU_UNAVAILABLE.body'),
    returnToProduct: true,
  },
  VERIFICATION_REQUIRED: {
    title: failureMessage.text('VERIFICATION_REQUIRED.title'),
    body: failureMessage.text('VERIFICATION_REQUIRED.body'),
    returnToProduct: false,
  },
  ALREADY_ORDERED: {
    title: failureMessage.text('ALREADY_ORDERED.title'),
    body: failureMessage.text('ALREADY_ORDERED.body'),
    returnToProduct: false,
  },
  IN_FLIGHT: {
    title: failureMessage.text('IN_FLIGHT.title'),
    body: failureMessage.text('IN_FLIGHT.body'),
    returnToProduct: false,
  },
  INVALID_DELIVERY: {
    title: failureMessage.text('INVALID_DELIVERY.title'),
    body: failureMessage.text('INVALID_DELIVERY.body'),
    returnToProduct: false,
  },
  UNEXPECTED: {
    title: failureMessage.text('UNEXPECTED.title'),
    body: failureMessage.text('UNEXPECTED.body'),
    returnToProduct: false,
  },
};

export function refusalCopyOf(failure: CheckoutFailure): RefusalCopy {
  return REFUSAL[failure];
}
