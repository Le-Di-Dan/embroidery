/**
 * Feature service seam over the two `APP7-B04` **mutations**:
 * `adminPaymentAttempt_verify` and `adminPaymentAttempt_review`.
 *
 * Kept apart from the read seam because the two have different rules. A read may
 * be re-issued freely; neither of these may be re-issued blindly. Verification
 * is the only operation in the phase that can move money state, review writes an
 * immutable reconciliation row, and both are deliberate operator actions with a
 * durable append-only record behind them — so nothing on this path retries
 * automatically, and the callers disable the control that is in flight.
 *
 * The bodies are built in the model and arrive here already shaped as the
 * generated types. This module adds no field: it cannot, because the generated
 * body types have no member for an actor, a status, an expected value or a
 * correlation id.
 *
 * Both return a `PaymentDecisionResponse`, which is a **receipt**, not a new
 * source of truth. The caller re-reads `adminOrderPayment_read` and renders the
 * persisted result; building the new attempt, obligation or order status out of
 * what this returns is how a screen shows a payment the database does not have.
 */
import {
  adminPaymentAttemptReview,
  adminPaymentAttemptVerify,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  PaymentDecisionResponse,
  ReviewPaymentAttemptBody,
  VerifyPaymentAttemptBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { OrderDetailApiError } from '../model/order-detail-failure';

/**
 * Verifies one bank-transfer deposit attempt against funds actually received.
 *
 * A `200` is not a success: `APP7-B04` answers `200` for an exact match and for
 * a mismatch alike, and `attemptStatus` says which. Reading that is
 * `payment-decision-outcome.ts`'s job, not this module's.
 *
 * Re-sending the *same* values after a lost response is safe by contract — the
 * server returns the committed truth with `replayed: true` and writes nothing a
 * second time — which is the whole basis of the ambiguity recovery. Re-sending
 * *different* values is not a replay and is answered `409`.
 */
export async function verifyPaymentAttempt(
  attemptId: string,
  body: VerifyPaymentAttemptBody,
): Promise<PaymentDecisionResponse> {
  try {
    const response = await adminPaymentAttemptVerify(attemptId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new OrderDetailApiError(normalizeApiClientError(error));
  }
}

/**
 * Routes one attempt to manual review.
 *
 * There is no branch in this operation that could settle a payment: the deposit
 * is not satisfied, the order does not move, and no verification event is
 * emitted. The endpoint itself means `REQUIRES_REVIEW`, so no status is sent.
 */
export async function reviewPaymentAttempt(
  attemptId: string,
  body: ReviewPaymentAttemptBody,
): Promise<PaymentDecisionResponse> {
  try {
    const response = await adminPaymentAttemptReview(attemptId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new OrderDetailApiError(normalizeApiClientError(error));
  }
}
