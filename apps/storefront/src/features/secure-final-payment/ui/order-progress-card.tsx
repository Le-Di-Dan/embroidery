'use client';

import {
  CustomerFinalPaymentResponseOrderStatus as OrderStatus,
  type CustomerFinalPaymentResponse,
} from '@embroidery/api-client';

import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { ORDER_PROGRESS_STEPS, orderProgressReached } from '../model/order-progress';

/**
 * `818:49` / `818:99` / `818:149` — the settled lane: money received, then
 * progress, and nothing else.
 *
 * ## The three readings are one card
 *
 * `READY_FOR_DELIVERY`, `DELIVERED` and `COMPLETED` differ in their headline,
 * their sentence and how many of the four steps are filled. They are the same
 * card in three states, exactly as the approved frames draw them, so the same
 * component serves all three and there is no second route or second panel for
 * the tail of the lifecycle.
 *
 * ## What is not here, and could not be added by accident
 *
 * `818:84` and `818:134` mark the exclusion on the frames themselves: no
 * carrier name, no tracking code, no track-package control, no courier status,
 * no estimate, no map and no shipment timeline. This component receives
 * `CustomerFinalPaymentResponse` and nothing else — a projection that carries
 * none of those fields — so there is no value in scope for one of them to be
 * rendered from, and no Storefront call anywhere in this feature reaches an
 * Admin shipping operation. `APP9-S01` §15 is enforced by what was never handed
 * to this component rather than by remembering not to print it.
 *
 * `818:184` marks the other exclusion: no refund, return or cancellation
 * control appears on the terminal state, and none is drawn as a disabled
 * placeholder either (`PO-APP9-001 = OPTION A — DEFER`, §17).
 *
 * ## The stepper is a stepper, not a timeline
 *
 * Four labels and how many have been reached, derived from one field. No
 * timestamps, no durations, nothing that ticks. `aria-current` marks the step
 * the order is on so a screen reader hears position rather than inferring it
 * from a filled circle it cannot see.
 */
interface OrderProgressCardProps {
  readonly payment: CustomerFinalPaymentResponse;
}

function headlineOf(orderStatus: CustomerFinalPaymentResponse['orderStatus']) {
  switch (orderStatus) {
    case OrderStatus.COMPLETED:
      return COPY.settled.completed;
    case OrderStatus.DELIVERED:
      return COPY.settled.delivered;
    default:
      return COPY.settled.paid;
  }
}

export function OrderProgressCard({ payment }: OrderProgressCardProps) {
  const headline = headlineOf(payment.orderStatus);
  const reached = orderProgressReached(payment.orderStatus);

  return (
    <section className="secure-final-payment__card" aria-labelledby="final-payment-settled">
      <h2 className="secure-final-payment__card-title" id="final-payment-settled">
        <span className="secure-final-payment__card-symbol" aria-hidden="true">
          ✓
        </span>
        {headline.cardTitle}
      </h2>
      <p className="secure-final-payment__body">{headline.body}</p>

      <ol className="secure-final-payment__stepper" aria-label={COPY.settled.progressLabel}>
        {ORDER_PROGRESS_STEPS.map((step, index) => {
          const done = index < reached;
          return (
            <li
              className={`secure-final-payment__step ${
                done ? 'secure-final-payment__step--done' : 'secure-final-payment__step--todo'
              }`}
              key={step}
              {...(index === reached - 1 ? { 'aria-current': 'step' as const } : {})}
            >
              <span className="secure-final-payment__step-symbol" aria-hidden="true">
                {done ? '●' : '○'}
              </span>
              <span className="secure-final-payment__step-label">{step}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
