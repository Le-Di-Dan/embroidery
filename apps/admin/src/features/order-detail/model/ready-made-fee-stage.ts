/**
 * Which of the three shipping-fee states a Ready-Made order is in
 * (`913:337`, `914:361`; `BR-028`).
 *
 * Extracted from the card for the reason `fulfillment-capability.ts` was
 * extracted from the APP9 rail: the rule is worth reading and testing on its
 * own, and a component that held it inline would grow a conditional that quietly
 * became a second commercial authority.
 *
 * ## It reads the obligation, not the order status
 *
 * The question "may this fee still be edited" is answered by the `FULL`
 * obligation's own LC-15 state, because that is what `BR-028` is about: money
 * already collected may not be silently re-priced. The order's LC-14 status is
 * a *consequence* of the same events and would be a second, laggier way of
 * asking — and on a superseded/successor pair it does not move at all, so it
 * cannot distinguish the two editable states.
 *
 * ## It is presentation routing, never enforcement
 *
 * The server refuses a fee change against a satisfied obligation on its own
 * terms, with zero writes. Nothing here changes that. This picks which approved
 * card to show; a refusal is still the server's to issue, and the screen
 * re-reads and renders the committed truth when one arrives.
 */
import type {
  AdminOrderPaymentsResponse,
  AdminShippingDetailResponse,
} from '@embroidery/api-client';

import { readOptionalText } from './shipping-detail-form';

export type ReadyMadeFeeStage =
  /** No fee stored yet: the first pricing, which creates the `FULL`. */
  | 'unpriced'
  /** A live `PENDING` `FULL`: a change supersedes it with a successor. */
  | 'correctable'
  /** The `FULL` is `SATISFIED`, or the detail is frozen: refuse and say why. */
  | 'settled';

const OBLIGATION_PENDING = 'PENDING';
const SHIPPING_FROZEN = 'FROZEN';

export function readyMadeFeeStage(
  detail: AdminShippingDetailResponse,
  payments: AdminOrderPaymentsResponse,
): ReadyMadeFeeStage {
  // Dispatch froze the detail (GRD-017), so nothing on it is editable — checked
  // first because it outranks the obligation: a dispatched order's fee is
  // immutable whatever the payment says.
  if (detail.status === SHIPPING_FROZEN) {
    return 'settled';
  }

  const obligation = payments.currentObligation;
  if (obligation === undefined) {
    // No obligation yet. `BR-029` creates the `FULL` with the first fee, so
    // this is the pre-pricing state — and it is reached with a stored fee of
    // `null`, never `0`.
    return 'unpriced';
  }

  // A live obligation that is still `PENDING` may be re-priced; anything else
  // it can be (`SATISFIED`, and the terminal states LC-15 publishes) may not.
  return obligation.status === OBLIGATION_PENDING ? 'correctable' : 'settled';
}

/** Whether a fee is stored at all — `null` is unpriced, `"0.00"` is free. */
export function hasStoredFee(detail: AdminShippingDetailResponse): boolean {
  return readOptionalText(detail.feeAmount) !== null;
}
