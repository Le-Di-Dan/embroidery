/**
 * The answers the one Admin final-payment entry command may give
 * (`APP9-B01` §7, §12).
 *
 * Three, and it stays at three because `TR-LC14-05` is one transition with one
 * source state and one domain requirement. There is no verification conflict,
 * no attempt code and no shipping refusal here: `APP9-B03` owns Admin final
 * payment verification and `APP9-B05` owns dispatch, and a refusal code minted
 * before the operation that raises it is a contract promise nothing keeps.
 *
 * Every answer is safe to be specific about. The caller is an authenticated
 * operator behind `AuthenticatedAdminGuard`, and none of these names anything
 * they did not already type: no amount, no obligation identifier, no customer
 * contact, no transfer reference and no session secret. Nothing here shapes a
 * `PersistenceError` into a response — a SQLSTATE, a constraint name and a query
 * fragment travel to the platform filter, which already sanitises them.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ORDER_FINAL_PAYMENT_FAILURES = [
  /** No `orders` row with that id. */
  'ORDER_NOT_FOUND',
  /**
   * The order is not `PRODUCTION_COMPLETED`.
   *
   * One code for both readings of that: an order still in production, and an
   * order whose final-payment window is already open. `TR-LC14-05` is legal from
   * exactly one state, so "already moved" is not a distinct outcome — it is the
   * same guard answering about a later instant.
   */
  'ORDER_INVALID_TRANSITION',
  /**
   * The order has no live `REMAINING` obligation.
   *
   * A refusal, never a repair. The obligation is created beside the `DEPOSIT`
   * one when the order is converted (`APP7-W01`), so its absence is a historical
   * data fault for an operator to escalate — not something an Admin command
   * fabricates on the way past (`APP9-G01` §4).
   */
  'ORDER_REMAINING_PAYMENT_MISSING',
] as const;

export type OrderFinalPaymentFailure = (typeof ORDER_FINAL_PAYMENT_FAILURES)[number];

export class OrderFinalPaymentError extends Error {
  readonly failure: OrderFinalPaymentFailure;

  constructor(failure: OrderFinalPaymentFailure) {
    super(failure);
    this.name = 'OrderFinalPaymentError';
    this.failure = failure;
  }
}

export function orderFinalPaymentError(failure: OrderFinalPaymentFailure): OrderFinalPaymentError {
  return new OrderFinalPaymentError(failure);
}

export function isOrderFinalPaymentError(error: unknown): error is OrderFinalPaymentError {
  return error instanceof OrderFinalPaymentError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<OrderFinalPaymentFailure, () => HttpException>> = {
  ORDER_NOT_FOUND: () =>
    new HttpException({ code: 'ORDER_NOT_FOUND', message: 'No such order.' }, HttpStatus.NOT_FOUND),
  ORDER_INVALID_TRANSITION: () =>
    new HttpException(
      {
        code: 'ORDER_INVALID_TRANSITION',
        message: 'Only an order that has completed production can enter final payment.',
      },
      HttpStatus.CONFLICT,
    ),
  ORDER_REMAINING_PAYMENT_MISSING: () =>
    new HttpException(
      {
        code: 'ORDER_REMAINING_PAYMENT_MISSING',
        message: 'This order has no live remaining payment to open.',
      },
      HttpStatus.CONFLICT,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedOrderFinalPayment<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isOrderFinalPaymentError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
