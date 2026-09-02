import type { NormalizedApiError } from '@embroidery/api-client';

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
    title: 'Sản phẩm vừa hết hàng',
    body: 'Rất tiếc, kích thước bạn chọn vừa được đặt hết. Bạn có thể chọn kích thước khác.',
    returnToProduct: true,
  },
  SKU_UNAVAILABLE: {
    title: 'Sản phẩm này hiện không bán được',
    body: 'Lựa chọn của bạn không còn được bán. Vui lòng chọn lại trên trang sản phẩm.',
    returnToProduct: true,
  },
  VERIFICATION_REQUIRED: {
    title: 'Cần xác minh lại liên hệ',
    body: 'Xác minh của bạn không còn hiệu lực. Vui lòng xác minh lại rồi đặt hàng.',
    returnToProduct: false,
  },
  ALREADY_ORDERED: {
    title: 'Liên hệ này đã đặt một đơn khác',
    body: 'Vui lòng xác minh lại liên hệ để đặt đơn hàng mới.',
    returnToProduct: false,
  },
  IN_FLIGHT: {
    title: 'Đơn hàng đang được tạo',
    body: 'Vui lòng đợi một lát rồi thử lại. Đừng đặt lại để tránh tạo hai đơn.',
    returnToProduct: false,
  },
  INVALID_DELIVERY: {
    title: 'Thông tin giao hàng chưa hợp lệ',
    body: 'Vui lòng kiểm tra lại thông tin người nhận và địa chỉ rồi thử lại.',
    returnToProduct: false,
  },
  UNEXPECTED: {
    title: 'Không tạo được đơn',
    body: 'Đã có lỗi khi gửi đơn hàng. Vui lòng thử lại sau ít phút.',
    returnToProduct: false,
  },
};

export function refusalCopyOf(failure: CheckoutFailure): RefusalCopy {
  return REFUSAL[failure];
}
