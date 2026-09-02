/**
 * The answers the two Admin shipping-detail operations may give
 * (`APP9-B04` §6, §10, §12).
 *
 * Every answer is safe to be specific about. The caller is an authenticated
 * operator behind `AuthenticatedAdminGuard`, and none of these names anything
 * they did not already type: no customer contact, no grant identifier, no
 * challenge identifier, no token, no OTP and no obligation amount. Nothing here
 * shapes a `PersistenceError` into a response — a SQLSTATE, a constraint name
 * and a query fragment travel to the platform filter, which already sanitises
 * them.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ADMIN_SHIPPING_FAILURES = [
  /** No `orders` row with that id. */
  'ORDER_NOT_FOUND',
  /** The order has no shipping detail saved yet, on the read. */
  'SHIPPING_DETAIL_NOT_FOUND',
  /**
   * The detail is `FROZEN` — dispatch has already snapshotted it (GRD-017).
   *
   * A refusal, never a thaw. `APP9-B05` owns the freeze boundary and nothing
   * before it may cross back: an address that was shipped to is evidence, and
   * editing it would make the snapshot a lie. Post-freeze corrections are
   * compensating `order_transitions` records, not data edits.
   */
  'SHIPPING_FROZEN',
  /**
   * A fee change was asked for and the order has no live `REMAINING` obligation
   * to recalculate.
   *
   * A refusal, never a repair. The obligation is created beside the `DEPOSIT`
   * one when the order is converted (`APP7-W01`), so its absence is a historical
   * data fault for an operator to escalate.
   */
  'ORDER_REMAINING_PAYMENT_MISSING',
  /**
   * A fee change was asked for while the live `REMAINING` is already
   * `SATISFIED`.
   *
   * `TR-LC15-04` is `PENDING -> SUPERSEDED` and nothing else; `SATISFIED` is
   * terminal in LC-15. There is no canonical path that turns money the customer
   * has already paid back into a payable balance, and inventing one would need a
   * backward LC-14 move (`READY_FOR_DELIVERY -> AWAITING_FINAL_PAYMENT`) that
   * does not exist. So the *fee-changing* write is refused with nothing written;
   * a non-fee edit on the same order still succeeds.
   */
  'SHIPPING_FEE_CHANGE_NOT_AVAILABLE',
  /**
   * A fee **increase** was asked for and no valid customer acknowledgement
   * evidence stands.
   *
   * One code for every reading of that — no active grant, a grant that is
   * expired or belongs to another request or customer, or no fresh verified
   * step-up. The operator's remedy is the same in all of them: the customer must
   * be taken through the secure flow again before the higher fee can be applied.
   * Naming which half failed would publish the state of a customer's credential
   * to a screen that has no use for it.
   */
  'SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED',
  /**
   * The resulting remaining balance would not be a positive whole đồng.
   *
   * `ck_payment_obligations__amount_positive` requires `> 0` and the VND scale
   * CHECK requires a whole đồng. Refused here as bad input rather than left to
   * surface as a constraint violation.
   */
  'SHIPPING_FEE_NOT_APPLICABLE',
  /**
   * A Ready-Made fee was set against an order whose lifecycle does not permit
   * one (`APP12-B03` §9, §23).
   *
   * `BR-027` gives the fee exactly two legal moments: the **first** set while
   * the order is `AWAITING_SHIPPING_FEE`, and a **correction** while it is
   * `AWAITING_PAYMENT` and still unpaid. Everything else is this refusal —
   * most importantly an order the expiry sweep has already `CANCELLED`, which
   * must stay cancelled. Confirming a fee on it would hand back a payable
   * order whose stock was returned to availability minutes earlier, and LC-14
   * defines no move out of `CANCELLED` to carry it.
   */
  'ORDER_SHIPPING_FEE_NOT_SETTABLE',
  /**
   * The Ready-Made order holds no active `RESERVED` reservation
   * (`APP12-B03` §9).
   *
   * The stock behind this order has been expired, released or consumed. A fee
   * set would price merchandise that is no longer committed to this customer,
   * so it is refused rather than allowed to create a payable total against
   * nothing. Nothing is re-reserved here: a new reservation would be a silent
   * second claim on stock another order may already hold.
   */
  'ORDER_RESERVATION_NOT_HELD',
  /**
   * The order is `AWAITING_PAYMENT` but carries no live `FULL` obligation to
   * correct (`APP12-B03` §18).
   *
   * A historical data fault for an operator to escalate, never a repair: the
   * obligation is created by the first fee confirmation in the same
   * transaction that moved the order into this state, so its absence means the
   * two halves have already diverged and minting a replacement would hide that.
   */
  'ORDER_FULL_PAYMENT_MISSING',
  /**
   * The order's frozen lines carry no subtotal this path can price against
   * (`APP12-B03` §10).
   *
   * `sum(order_items.line_total_amount)` was absent or not a whole đồng. The
   * Catalog is deliberately **not** consulted as a fallback — that is the one
   * substitution `BR-021` forbids — so an order whose frozen history cannot be
   * read is escalated rather than repriced from a live product.
   */
  'ORDER_SUBTOTAL_NOT_AVAILABLE',
] as const;

export type AdminShippingFailure = (typeof ADMIN_SHIPPING_FAILURES)[number];

export class AdminShippingError extends Error {
  readonly failure: AdminShippingFailure;

  constructor(failure: AdminShippingFailure) {
    super(failure);
    this.name = 'AdminShippingError';
    this.failure = failure;
  }
}

export function adminShippingError(failure: AdminShippingFailure): AdminShippingError {
  return new AdminShippingError(failure);
}

export function isAdminShippingError(error: unknown): error is AdminShippingError {
  return error instanceof AdminShippingError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<AdminShippingFailure, () => HttpException>> = {
  ORDER_NOT_FOUND: () =>
    new HttpException({ code: 'ORDER_NOT_FOUND', message: 'No such order.' }, HttpStatus.NOT_FOUND),
  SHIPPING_DETAIL_NOT_FOUND: () =>
    new HttpException(
      {
        code: 'SHIPPING_DETAIL_NOT_FOUND',
        message: 'This order has no shipping details yet.',
      },
      HttpStatus.NOT_FOUND,
    ),
  SHIPPING_FROZEN: () =>
    new HttpException(
      {
        code: 'SHIPPING_FROZEN',
        message: 'Shipping details can no longer be changed for this order.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_REMAINING_PAYMENT_MISSING: () =>
    new HttpException(
      {
        code: 'ORDER_REMAINING_PAYMENT_MISSING',
        message: 'This order has no live remaining payment to recalculate.',
      },
      HttpStatus.CONFLICT,
    ),
  SHIPPING_FEE_CHANGE_NOT_AVAILABLE: () =>
    new HttpException(
      {
        code: 'SHIPPING_FEE_CHANGE_NOT_AVAILABLE',
        message:
          'The remaining payment for this order has already been settled, so the shipping fee ' +
          'can no longer be changed.',
      },
      HttpStatus.CONFLICT,
    ),
  SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED: () =>
    new HttpException(
      {
        code: 'SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED',
        message: 'A higher shipping fee needs the customer’s confirmation before it can be saved.',
      },
      HttpStatus.CONFLICT,
    ),
  SHIPPING_FEE_NOT_APPLICABLE: () =>
    new HttpException(
      {
        code: 'SHIPPING_FEE_NOT_APPLICABLE',
        message: 'That shipping fee does not leave a valid remaining balance on this order.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_SHIPPING_FEE_NOT_SETTABLE: () =>
    new HttpException(
      {
        code: 'ORDER_SHIPPING_FEE_NOT_SETTABLE',
        message: 'This order is not at a stage where its shipping fee can be set.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_RESERVATION_NOT_HELD: () =>
    new HttpException(
      {
        code: 'ORDER_RESERVATION_NOT_HELD',
        message: 'The stock reserved for this order is no longer held.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_FULL_PAYMENT_MISSING: () =>
    new HttpException(
      {
        code: 'ORDER_FULL_PAYMENT_MISSING',
        message: 'This order has no live payment to recalculate.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_SUBTOTAL_NOT_AVAILABLE: () =>
    new HttpException(
      {
        code: 'ORDER_SUBTOTAL_NOT_AVAILABLE',
        message: 'This order’s recorded items do not add up to a total that can be priced.',
      },
      HttpStatus.CONFLICT,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedAdminShipping<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isAdminShippingError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
