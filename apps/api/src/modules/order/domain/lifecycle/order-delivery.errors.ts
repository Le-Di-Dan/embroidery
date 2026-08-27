/**
 * The answers the two Admin delivery commands may give (`APP9-B05` §5, §11).
 *
 * Five, and each belongs to a canonical guard rather than to a screen:
 * `GRD-017` refuses an incomplete shipping detail, `GRD-016` refuses an
 * unsatisfied balance, `GRD-018` refuses a completion before delivery, and
 * LC-14's source states refuse everything else. Nothing here names a carrier
 * status, a parcel event or a delivery confirmation: `LIVE_CARRIER_TRACKING`
 * is out of scope, so a refusal code minted for it would be a contract promise
 * nothing keeps.
 *
 * Every answer is safe to be specific about. The caller is an authenticated
 * operator behind `AuthenticatedAdminGuard`, and none of these names anything
 * they did not already type: no recipient, no address, no phone number, no fee,
 * no obligation identifier and no session secret. Nothing here shapes a
 * `PersistenceError` into a response — a SQLSTATE, a constraint name and a
 * query fragment travel to the platform filter, which already sanitises them.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ORDER_DELIVERY_FAILURES = [
  /** No `orders` row with that id. */
  'ORDER_NOT_FOUND',
  /**
   * The order is not in the one state the command is legal from —
   * `READY_FOR_DELIVERY` for a dispatch, `DELIVERED` for a completion.
   *
   * One code for every reading of that: too early, on hold, cancelling, and
   * already moved. Each of these transitions is legal from exactly one state,
   * so "already dispatched" is not a distinct outcome — it is the same guard
   * answering about a later instant, which is what makes replay a deterministic
   * refusal rather than a second receipt.
   */
  'ORDER_INVALID_TRANSITION',
  /**
   * `GRD-017` — the order has no shipping detail, or the one it has is not
   * complete enough to freeze.
   *
   * "Complete" is the delivered schema's own answer, not an invented checklist:
   * recipient, address and province are `NOT NULL` columns, and the fee is the
   * one nullable fact a dispatch cannot proceed without, because the snapshot's
   * `fee_amount` is `NOT NULL` and a freeze with no fee would record an amount
   * nobody agreed to. `carrier_name` and `tracking_code` are **not** required:
   * they are static internal notes (`APP9-B05` §6, §14), and demanding them
   * would invent a carrier prerequisite no authority states.
   */
  'ORDER_SHIPPING_NOT_READY',
  /**
   * `GRD-016` — the order's live `REMAINING` obligation is not `SATISFIED`.
   *
   * Checked in the dispatch transaction because three canonical documents put
   * it there — `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §2 ("validate GRD-016 …
   * trong dispatch tx"), the guard catalog's `TR-LC14-06/07` scope, and CC-14's
   * "LOCK + GRD-016 in dispatch tx" — not because the lifecycle is doubted. A
   * shipping-fee recalculation supersedes a satisfied balance with a new
   * `PENDING` one (`APP9-B04`) *without* moving the order, so an order can sit
   * in `READY_FOR_DELIVERY` owing money, and the source state alone would not
   * catch it.
   */
  'ORDER_REMAINING_PAYMENT_UNSATISFIED',
  /**
   * The order has no live `REMAINING` obligation at all.
   *
   * A refusal, never a repair: the obligation is created beside the `DEPOSIT`
   * one when the order is converted (`APP7-W01`), so its absence is a
   * historical data fault for an operator to escalate — not something a
   * dispatch fabricates on the way past.
   */
  'ORDER_REMAINING_PAYMENT_MISSING',
] as const;

export type OrderDeliveryFailure = (typeof ORDER_DELIVERY_FAILURES)[number];

export class OrderDeliveryError extends Error {
  readonly failure: OrderDeliveryFailure;

  constructor(failure: OrderDeliveryFailure) {
    super(failure);
    this.name = 'OrderDeliveryError';
    this.failure = failure;
  }
}

export function orderDeliveryError(failure: OrderDeliveryFailure): OrderDeliveryError {
  return new OrderDeliveryError(failure);
}

export function isOrderDeliveryError(error: unknown): error is OrderDeliveryError {
  return error instanceof OrderDeliveryError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<OrderDeliveryFailure, () => HttpException>> = {
  ORDER_NOT_FOUND: () =>
    new HttpException({ code: 'ORDER_NOT_FOUND', message: 'No such order.' }, HttpStatus.NOT_FOUND),
  ORDER_INVALID_TRANSITION: () =>
    new HttpException(
      {
        code: 'ORDER_INVALID_TRANSITION',
        message: 'This order is not at the step that command moves it from.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_SHIPPING_NOT_READY: () =>
    new HttpException(
      {
        code: 'ORDER_SHIPPING_NOT_READY',
        message: 'This order’s shipping details are not complete enough to dispatch.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_REMAINING_PAYMENT_UNSATISFIED: () =>
    new HttpException(
      {
        code: 'ORDER_REMAINING_PAYMENT_UNSATISFIED',
        message: 'This order’s remaining payment has not been satisfied.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_REMAINING_PAYMENT_MISSING: () =>
    new HttpException(
      {
        code: 'ORDER_REMAINING_PAYMENT_MISSING',
        message: 'This order has no live remaining payment.',
      },
      HttpStatus.CONFLICT,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedOrderDelivery<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isOrderDeliveryError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
