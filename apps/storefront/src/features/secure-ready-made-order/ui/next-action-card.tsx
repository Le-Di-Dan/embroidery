'use client';

import type { FullPayment } from '../hooks/use-full-payment';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { type OrderVariant } from '../model/order-access-state';
import { OrderNote } from './order-note';

/**
 * The **next-action block** — one of the three the approved state board varies
 * (`911:306`: *pill trạng thái, khối hành động kế tiếp, khối thanh toán/giao
 * hàng*).
 *
 * Every sentence here is the one the state board drew for that variant
 * (`911:312`, `911:319`, `911:327`, `911:334`, `911:342`, `911:349`, `911:356`,
 * `911:363`) with its second line where one exists (`911:313`, `911:328`,
 * `911:364`). Nothing is generated from a status enum, and no variant borrows
 * another's words.
 *
 * ## The one control this route offers, and when
 *
 * The initiation button appears in exactly one variant — `AWAITING_PAYMENT`
 * with a live payable obligation and no current attempt. That is §19's "no
 * automatic initiation" and §30's terminal shutdown expressed as one condition
 * rather than as guards scattered across the tree: a cancelled, expired,
 * delivered, completed or under-review order never renders it, and neither does
 * one whose fee is not set, because none of them satisfies the condition.
 *
 * Once an attempt is open the control is replaced by a line saying the details
 * are below — not a disabled button, which would read as an affordance the
 * customer is being denied rather than one they have already used.
 *
 * ## The superseded notice (§24)
 *
 * When a shipping-fee correction supersedes the obligation this session's
 * attempt was opened against, the attempt is withheld from every consumer at
 * once and this line explains why the figure changed. The predecessor is not
 * shown as current, its evidence does not migrate, and the customer is pointed
 * at the new amount rather than left to wonder which of two figures to send.
 *
 * ## Failures are notices over a working screen (§32)
 *
 * A refused initiation that is not a dead link and not a missing step-up
 * becomes a note here. The screen keeps everything it had; nothing retries on
 * its own; and no refusal is worded as a statement about the customer's link,
 * because the only refusal that means that has already replaced the whole page.
 */
interface NextActionCardProps {
  readonly variant: OrderVariant;
  readonly payment: FullPayment;
  /** True only where the payment block is on screen and the server says payable. */
  readonly payable: boolean;
}

export function NextActionCard({ variant, payment, payable }: NextActionCardProps) {
  const state = COPY.states[variant];
  const offersInitiation = variant === 'AWAITING_PAYMENT' && payable;

  return (
    <section className="secure-order__card" aria-labelledby="secure-order-next">
      <h2 className="secure-order__card-title" id="secure-order-next">
        {state.body}
      </h2>

      {state.note === undefined ? null : <OrderNote tone="INFO">{state.note}</OrderNote>}

      {payment.attemptSuperseded ? (
        <OrderNote tone="WARNING">{COPY.attempt.superseded}</OrderNote>
      ) : null}

      {payment.initiateFailure === undefined ? null : (
        <OrderNote tone="DANGER">{COPY.attemptFailure[payment.initiateFailure]}</OrderNote>
      )}

      {renderAction()}
    </section>
  );

  function renderAction() {
    if (!offersInitiation) return null;
    if (payment.attempt !== undefined) {
      return <p className="secure-order__body">{COPY.attempt.opened}</p>;
    }
    return (
      <button
        type="button"
        className="secure-order__button secure-order__button--primary"
        onClick={payment.startAttempt}
        disabled={payment.initiating}
      >
        {payment.initiating ? COPY.attempt.starting : COPY.attempt.start}
      </button>
    );
  }
}
