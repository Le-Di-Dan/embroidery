import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';

/**
 * `DELIVERED` — both obligations are settled, and the screen may say so
 * (`815:71`).
 *
 * This is the one place the APP9 rail states something about the balance
 * without a read behind it, and it is a **lifecycle** inference rather than a
 * fabricated amount. `GRD-016` makes a satisfied live REMAINING obligation a
 * precondition of dispatch, checked inside the dispatch transaction; an order
 * that reached `DELIVERED` went through that gate. So "đã thu" is a statement
 * about a guard that provably passed, not a figure this component computed.
 *
 * No amount appears here for exactly that reason. The obligation's value is
 * still unreadable (`FU-APP9-B03-02`), and a number would have to be derived —
 * which a shipping-fee increase can falsify. What the guard proves is that the
 * balance was settled, not what it was.
 */
export function SettledPaymentCard() {
  return (
    <section
      className="order-card"
      aria-labelledby="settled-payment-heading"
      data-testid="settled-payment"
    >
      <h2 className="order-card__title" id="settled-payment-heading">
        {COPY.payment.title}
      </h2>
      <div className="order-fulfillment__badges">
        <AdminStatusBadge
          token="DEPOSIT_SATISFIED"
          label={COPY.payment.depositSettled}
          tone="success"
          symbol={STATUS_SYMBOLS.succeeded}
          testId="deposit-settled"
        />
        <AdminStatusBadge
          token="REMAINING_SATISFIED"
          label={COPY.payment.remainingSettled}
          tone="success"
          symbol={STATUS_SYMBOLS.succeeded}
          testId="remaining-settled"
        />
      </div>
      <p className="order-card__note">{COPY.payment.settledNote}</p>
    </section>
  );
}
