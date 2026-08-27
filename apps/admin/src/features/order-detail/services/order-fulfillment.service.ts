/**
 * Feature service seam over the five APP9 Admin operations the commerce
 * completion workspace consumes: `adminOrder_transition`,
 * `adminOrderShipping_read`, `adminOrderShipping_save`, `adminOrder_dispatch`
 * and `adminOrder_complete`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as an `OrderFulfillmentApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * ### Four of these five are writes, and none of them retries
 *
 * Only the shipping read may be re-issued freely. Opening the final payment,
 * saving a detail, dispatching and completing are each a single deliberate
 * operator action with a durable record behind it, so nothing on this path
 * retries automatically and the callers disable the control that is in flight.
 * Dispatch in particular is not idempotent in any way a client may exploit: the
 * server refuses a second call rather than answering the first one again.
 *
 * ### Every response is a receipt, never a new source of truth
 *
 * `AdminOrderTransitionResultResponse`, `AdminShippingDetailSavedResponse`,
 * `AdminOrderDispatchResponse` and `AdminOrderCompletionResponse` all report
 * what committed. The caller re-reads the order and renders the persisted
 * result; building the order's new status out of what these return is how a
 * screen shows a state the database does not have. The one thing a receipt is
 * used for is the fee outcome — `AdminShippingFeeOutcomeResponse` is the only
 * place the effect of a fee change is published at all.
 *
 * ### No customer command is reachable from here
 *
 * `publicOrderShippingFee_acknowledge` is deliberately absent, and so is every
 * other public operation. An Admin write may never mint the customer's
 * acknowledgement (`APP9-B04-C1`); a module that could call it would make that
 * a matter of self-discipline rather than of what is in scope.
 */
import {
  adminOrderComplete,
  adminOrderDispatch,
  adminOrderShippingRead,
  adminOrderShippingSave,
  adminOrderTransition,
  normalizeApiClientError,
  TransitionAdminOrderBodyTo,
} from '@embroidery/api-client';
import type {
  AdminOrderCompletionResponse,
  AdminOrderDispatchResponse,
  AdminOrderTransitionResultResponse,
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
  SaveShippingDetailBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { OrderFulfillmentApiError } from '../model/fulfillment-failure';

interface OrderScopedInput {
  readonly orderId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Opens the balance for collection — `PRODUCTION_COMPLETED →
 * AWAITING_FINAL_PAYMENT`, `TR-LC14-05`.
 *
 * The destination comes from the contract's own enum, which publishes exactly
 * one value. Nothing is created here: the REMAINING obligation was made beside
 * the deposit when the order was converted, and the order's new state is only
 * what makes it payable.
 */
export async function openFinalPayment(
  orderId: string,
): Promise<AdminOrderTransitionResultResponse> {
  try {
    const response = await adminOrderTransition(
      orderId,
      { to: TransitionAdminOrderBodyTo.AWAITING_FINAL_PAYMENT },
      { instance: getBrowserApiClient() },
    );
    return response.data;
  } catch (error: unknown) {
    throw new OrderFulfillmentApiError(normalizeApiClientError(error));
  }
}

/**
 * The order-owned shipping detail and its LC-19 state.
 *
 * The source of truth is the order's own row. There is no customer profile read
 * and no address book on this path — a delivery address is a fact about one
 * order, and defaulting it from a profile would silently ship to somewhere the
 * order never said.
 */
export async function fetchShippingDetail({
  orderId,
  signal,
}: OrderScopedInput): Promise<AdminShippingDetailResponse> {
  try {
    const response = await adminOrderShippingRead(orderId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return response.data;
  } catch (error: unknown) {
    throw new OrderFulfillmentApiError(normalizeApiClientError(error));
  }
}

export interface SaveShippingInput {
  readonly orderId: string;
  readonly body: SaveShippingDetailBody;
}

/**
 * Replaces the shipping detail, and — when the fee moved — the balance behind
 * it.
 *
 * A full replacement, not a patch: an optional member the body omits is cleared.
 * A fee **increase** with no matching customer acknowledgement is refused with
 * nothing written at all, including the non-fee fields in the same body.
 */
export async function saveShippingDetail({
  orderId,
  body,
}: SaveShippingInput): Promise<AdminShippingDetailSavedResponse> {
  try {
    const response = await adminOrderShippingSave(orderId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new OrderFulfillmentApiError(normalizeApiClientError(error));
  }
}

/**
 * Records delivery and freezes the shipping detail — `READY_FOR_DELIVERY →
 * DELIVERED`, `TR-LC14-07`.
 *
 * The freeze is a consequence, never a separate command: there is no operation
 * that freezes a detail without dispatching, and this screen offers no control
 * that pretends otherwise. The server re-checks in its own transaction that the
 * balance is settled — an order can sit at `READY_FOR_DELIVERY` and still owe
 * money after a fee increase superseded a satisfied obligation — so a caller may
 * never treat the order's status as proof of payment.
 */
export async function dispatchOrder(orderId: string): Promise<AdminOrderDispatchResponse> {
  try {
    const response = await adminOrderDispatch(orderId, { instance: getBrowserApiClient() });
    return response.data;
  } catch (error: unknown) {
    throw new OrderFulfillmentApiError(normalizeApiClientError(error));
  }
}

/**
 * Closes the order — `DELIVERED → COMPLETED`, `TR-LC14-08`.
 *
 * A separate call from dispatch, deliberately. There is no combined
 * dispatch-and-complete path here because there is no such operation, and one
 * built out of two calls would leave an order delivered but not completed
 * whenever the second failed.
 */
export async function completeOrder(orderId: string): Promise<AdminOrderCompletionResponse> {
  try {
    const response = await adminOrderComplete(orderId, { instance: getBrowserApiClient() });
    return response.data;
  } catch (error: unknown) {
    throw new OrderFulfillmentApiError(normalizeApiClientError(error));
  }
}
