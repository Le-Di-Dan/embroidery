import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';
import { LockedCapabilityList } from './locked-capability-list';

/**
 * `AWAITING_FINAL_PAYMENT` — the balance is open, and the screen says exactly
 * what it can see (`811:68`, `811:79`).
 *
 * ## What is rendered, and what is refused
 *
 * The lifecycle fact is real: the order is in `AWAITING_FINAL_PAYMENT`, so a
 * balance is payable and the customer has instructions on their secure page.
 * Everything an operator would want *beside* that — the amount, the transfer
 * attempts, the screenshots, the reconciliation history — is not readable by any
 * delivered Admin operation. `adminOrderPayment_read` filters `kind = 'DEPOSIT'`
 * in SQL and `adminOrder_detail` returns no payment data at all, so there is
 * nothing to project.
 *
 * So no rich remaining-payment panel is drawn, and no figure is derived: "tổng
 * đơn − tiền cọc" is arithmetic a shipping-fee increase falsifies, and a number
 * an operator might act on has to be one the server vouches for.
 * `FU-APP9-B03-02` stays open; the gap is named on screen rather than papered
 * over.
 *
 * ## Why the verification controls are not offered here
 *
 * `adminPaymentAttempt_verify` and `_review` are addressed by `attemptId`, and
 * the REMAINING attempt's id is behind exactly the same missing read. The
 * approved frame says so in its own annotation. Offering a button that could not
 * name an attempt would be a dead end dressed as a capability, so the card
 * states the limitation instead — the same operations remain the ones a balance
 * is verified through, and no "final payment verify" is invented in their place.
 *
 * ## The transport names never appear
 *
 * The decision response carries this obligation under `depositObligationId` and
 * `depositStatus` (`FU-APP9-B03-01`). Those are wire spellings. The screen says
 * "Thanh toán còn lại" and "Trạng thái thanh toán", here and everywhere else.
 */
export function RemainingPaymentCard() {
  return (
    <>
      <section className="order-card" aria-labelledby="fulfillment-remaining-heading">
        <h2 className="order-card__title" id="fulfillment-remaining-heading">
          {COPY.finalPayment.title}
        </h2>
        <AdminStatusBadge
          token="REMAINING_PENDING"
          label={COPY.finalPayment.awaitingBadge}
          tone="warning"
          symbol={STATUS_SYMBOLS.waiting}
          testId="remaining-payment-status"
        />
        <p className="order-card__help">{COPY.finalPayment.awaitingHelp}</p>

        <div className="order-fulfillment__gap" data-testid="remaining-amount-gap">
          <p className="order-fulfillment__gap-title">{COPY.apiGap.title}</p>
          <p className="order-fulfillment__gap-body">{COPY.apiGap.body}</p>
        </div>
      </section>

      <section className="order-card" aria-labelledby="fulfillment-verification-heading">
        <h2 className="order-card__title" id="fulfillment-verification-heading">
          {COPY.verification.title}
        </h2>
        <p className="order-card__help">{COPY.verification.help}</p>
        <p className="order-card__note" data-testid="remaining-verify-unavailable">
          {COPY.verification.unavailable}
        </p>
      </section>

      <LockedCapabilityList
        entries={[
          { label: COPY.locked.shipping, reason: COPY.locked.shippingWhy },
          { label: COPY.locked.dispatch, reason: COPY.locked.dispatchWhy },
          { label: COPY.locked.completion, reason: COPY.locked.completionWhy },
        ]}
      />
    </>
  );
}
