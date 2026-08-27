/**
 * The answers the customer acknowledgement command may give (`APP9-B04-C1` §4).
 *
 * A public surface, so the rule is the delivered one: every unusable token and
 * every unreachable target leaves as one `SECURE_LINK_UNAVAILABLE`, raised by
 * `secureLinkUnavailable()` and never by this file. What is listed here is only
 * what is reachable **after** the caller has already proved possession of a live
 * grant for this request — so none of it discloses anything a probe did not
 * already hold, and collapsing them would leave the customer's screen unable to
 * tell "confirm your contact again" from "this fee is no longer the one you were
 * shown".
 *
 * No amount, no grant id, no challenge id, no contact and no token appears in
 * any message below.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const SHIPPING_FEE_ACKNOWLEDGEMENT_FAILURES = [
  /**
   * The link is live, but no recent re-verification of this customer's own
   * contact stands (GRD-003).
   *
   * Not a statement about the link. The customer completes a STEP_UP
   * verification and calls again.
   */
  'REVERIFICATION_REQUIRED',
  /**
   * The submitted fee is not an increase over the fee this order is on.
   *
   * This command exists for increases only (`APP9-B04-C1` §6): a decrease is in
   * the customer's favour and DB3 §1.2 requires no acknowledgement for one, and
   * an equal fee is not a decision about anything. It is also the answer when
   * the fee the customer was shown has since moved — the baseline they are
   * acknowledging against is the server's, never theirs.
   */
  'SHIPPING_FEE_NOT_INCREASED',
  /**
   * The shipping detail is already `FROZEN`, so no fee change can be applied to
   * this order at all (GRD-017) and there is nothing to acknowledge.
   */
  'SHIPPING_FEE_NOT_ADJUSTABLE',
  /**
   * The `secure_grant` policy is unpublished or unusable, so GRD-003's window
   * has no length.
   *
   * A 503, not a refusal of the customer's decision, and it discloses no
   * configuration internal.
   */
  'ACKNOWLEDGEMENT_POLICY_UNAVAILABLE',
] as const;

export type ShippingFeeAcknowledgementFailure =
  (typeof SHIPPING_FEE_ACKNOWLEDGEMENT_FAILURES)[number];

export class ShippingFeeAcknowledgementError extends Error {
  readonly failure: ShippingFeeAcknowledgementFailure;

  constructor(failure: ShippingFeeAcknowledgementFailure) {
    super(failure);
    this.name = 'ShippingFeeAcknowledgementError';
    this.failure = failure;
  }
}

export function shippingFeeAcknowledgementError(
  failure: ShippingFeeAcknowledgementFailure,
): ShippingFeeAcknowledgementError {
  return new ShippingFeeAcknowledgementError(failure);
}

export function isShippingFeeAcknowledgementError(
  error: unknown,
): error is ShippingFeeAcknowledgementError {
  return error instanceof ShippingFeeAcknowledgementError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record`, so a failure added without a status stops compiling
 * rather than reaching a public client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<ShippingFeeAcknowledgementFailure, () => HttpException>> = {
  REVERIFICATION_REQUIRED: () =>
    new HttpException(
      {
        code: 'REVERIFICATION_REQUIRED',
        message: 'Please confirm your contact again before accepting this shipping fee.',
      },
      HttpStatus.FORBIDDEN,
    ),
  SHIPPING_FEE_NOT_INCREASED: () =>
    new HttpException(
      {
        code: 'SHIPPING_FEE_NOT_INCREASED',
        message: 'That is not the shipping-fee increase currently proposed for this order.',
      },
      HttpStatus.CONFLICT,
    ),
  SHIPPING_FEE_NOT_ADJUSTABLE: () =>
    new HttpException(
      {
        code: 'SHIPPING_FEE_NOT_ADJUSTABLE',
        message: 'The shipping fee for this order can no longer be changed.',
      },
      HttpStatus.CONFLICT,
    ),
  ACKNOWLEDGEMENT_POLICY_UNAVAILABLE: () =>
    new HttpException(
      {
        code: 'ACKNOWLEDGEMENT_POLICY_UNAVAILABLE',
        message: 'Shipping-fee confirmation is temporarily unavailable.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};

export function toShippingFeeAcknowledgementHttpException(
  error: ShippingFeeAcknowledgementError,
): HttpException {
  return RESPONSE_OF[error.failure]();
}
