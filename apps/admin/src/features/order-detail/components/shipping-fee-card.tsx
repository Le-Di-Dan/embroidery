import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { DefinitionRow } from './definition-row';

interface ShippingFeeCardProps {
  /** The fee currently stored on the order, or `null` when none is set. */
  readonly storedFee: string | null;
  readonly currencyCode: string;
  /** Whether the fee now in the editor is above the stored one. */
  readonly increasing: boolean;
}

/**
 * The shipping fee as it stands, and the rule that governs changing it
 * (`812:91`).
 *
 * The card shows one figure: the **stored** fee, transported as a string and
 * never recomputed. It deliberately does not show what the customer's balance
 * would become — that is the REMAINING obligation, which no Admin read projects
 * (`FU-APP9-B03-02`) and which a fee change supersedes rather than edits.
 *
 * ## The rule is stated before it is enforced
 *
 * A decrease or an unchanged fee saves immediately. An increase saves only when
 * the customer has already confirmed that exact amount, and an operator cannot
 * confirm on their behalf (`APP9-B04-C1`). Saying so up front is what makes the
 * refusal card comprehensible when it appears rather than surprising.
 *
 * The increase notice is a **warning, not a gate**. The comparison here is
 * against what this browser last read; the server measures against its own
 * stored fee and is the only judge. The save button stays enabled either way —
 * a screen that pre-refused could be wrong in the direction of blocking real
 * work, and the operator would have no way to find out.
 */
export function ShippingFeeCard({ storedFee, currencyCode, increasing }: ShippingFeeCardProps) {
  return (
    <section className="order-card" aria-labelledby="shipping-fee-heading">
      <h2 className="order-card__title" id="shipping-fee-heading">
        {COPY.shippingFee.title}
      </h2>
      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.shippingFee.currentLabel} testId="shipping-fee-current">
          {storedFee === null
            ? COPY.shippingFee.unsetValue
            : formatAmountWithCurrency(storedFee, currencyCode)}
        </DefinitionRow>
      </dl>
      <div className="order-fulfillment__gap">
        <p className="order-fulfillment__gap-title">{COPY.shippingFee.ruleTitle}</p>
        <p className="order-fulfillment__gap-body">{COPY.shippingFee.ruleBody}</p>
      </div>
      {increasing ? (
        <p className="order-card__note" data-testid="shipping-fee-increase-note">
          {COPY.feeRefusal.body}
        </p>
      ) : null}
    </section>
  );
}
