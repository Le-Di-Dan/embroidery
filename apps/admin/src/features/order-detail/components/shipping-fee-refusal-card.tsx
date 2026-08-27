import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';

interface ShippingFeeRefusalCardProps {
  /** The fee currently stored on the order, as the last read reported it. */
  readonly storedFee: string | null;
  /** The fee the operator typed, exactly as typed. */
  readonly attemptedFee: string;
  readonly currencyCode: string;
  /** Puts the stored fee back into the editor. Writes nothing. */
  readonly onRestore: () => void;
}

/**
 * `SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED` — the one refusal on this surface an
 * operator cannot resolve themselves (`812:197`).
 *
 * A card rather than an inline sentence, because the answer is not "try again".
 * A higher shipping fee needs the customer's own confirmation, and until that
 * exists the write is refused with **nothing written at all** — including the
 * recipient, address and carrier fields that travelled in the same body. The
 * card says so, since an operator who assumed a partial save had landed would
 * later dispatch to an address the order never stored.
 *
 * ## What is deliberately not here, and why it is not an oversight
 *
 * `APP9-B04-C1` is the authority: an Admin write may never mint the customer's
 * acknowledgement. So there is no "accept for customer" control, no override, no
 * force-save, and no field in which an operator could assert a fee the customer
 * agreed to — asserting it is exactly what the server refuses to accept, and a
 * control that pretended otherwise would be inviting an operator to work around
 * a consent rule. `publicOrderShippingFee_acknowledge` is a customer command and
 * is not reachable from this feature at all; the service seam does not import
 * it.
 *
 * Nor is there a link, a button or a message that would send the customer a new
 * fee to confirm. No delivered customer projection carries a server-authoritative
 * proposed fee (`CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED`), so any
 * such affordance here would have to invent the amount it was proposing. The
 * remedy sentence points at the one honest path — talk to the customer — and
 * names no grant, challenge, token or secure link while doing it.
 *
 * ## The only control is a local undo
 *
 * "Khôi phục mức phí đã lưu" puts the stored fee back into the form. It calls
 * nothing, writes nothing, and simply spares the operator retyping a figure they
 * can see two lines above.
 */
export function ShippingFeeRefusalCard({
  storedFee,
  attemptedFee,
  currencyCode,
  onRestore,
}: ShippingFeeRefusalCardProps) {
  return (
    <section
      className="order-card order-card--refusal"
      role="alert"
      aria-labelledby="fee-refusal-heading"
      data-testid="shipping-fee-refusal"
    >
      <h2 className="order-card__title" id="fee-refusal-heading">
        {COPY.feeRefusal.title}
      </h2>
      <p className="order-fulfillment__refusal-lead">{COPY.feeRefusal.body}</p>

      <dl className="order-fulfillment__compare">
        <div className="order-definition">
          <dt className="order-definition__label">{COPY.feeRefusal.acknowledgedLabel}</dt>
          <dd className="order-definition__value" data-testid="fee-refusal-stored">
            {storedFee === null
              ? COPY.shippingFee.unsetValue
              : formatAmountWithCurrency(storedFee, currencyCode)}
          </dd>
        </div>
        <div className="order-definition">
          <dt className="order-definition__label">{COPY.feeRefusal.attemptedLabel}</dt>
          <dd className="order-definition__value" data-testid="fee-refusal-attempted">
            {formatAmountWithCurrency(attemptedFee, currencyCode)}
          </dd>
        </div>
      </dl>

      <p className="order-card__note">{COPY.feeRefusal.nothingWritten}</p>
      <p className="order-card__help">{COPY.feeRefusal.remedy}</p>

      <div className="order-fulfillment__gap">
        <p className="order-fulfillment__gap-title">{COPY.feeRefusal.noOverrideTitle}</p>
        <p className="order-fulfillment__gap-body">{COPY.feeRefusal.noOverrideBody}</p>
      </div>

      {storedFee === null ? null : (
        <div className="order-fulfillment__actions">
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--secondary"
            data-testid="fee-refusal-restore"
            onClick={onRestore}
          >
            {COPY.feeRefusal.restore}
          </button>
        </div>
      )}
    </section>
  );
}
