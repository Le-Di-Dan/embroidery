'use client';

import type {
  CustomerFullPaymentResponse,
  ReadyMadeOrderAccessResponse,
} from '@embroidery/api-client';

import { formatExactAmount, formatExactMoney } from '../../../shared/money/exact-money';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { amountHighlightOf } from '../model/order-access-state';
import { CopyValueButton } from './copy-value-button';

/**
 * `910:293`…`910:305` — the amount card, and the customer half of `BR-027`.
 *
 * ## Three figures, three sources, one direction of authority
 *
 * ```text
 * highlight   ←  full.fullPaymentAmount     the live obligation (§15)
 *             ←  order.payment.payableTotal the satisfied obligation, as history
 * Tiền hàng   ←  order.merchandiseSubtotal  frozen at order creation
 * Phí giao    ←  order.delivery.feeAmount   the exact fee an operator set
 * ```
 *
 * The two rows are **supporting context**, printed because `910:298` and
 * `910:302` draw them, and they are never summed. §15 is explicit and the
 * contract agrees: the payable total "is the authoritative total; it is not
 * re-derived from the two fields above". After a shipping-fee correction the
 * obligation is recomposed from the frozen subtotal rather than adjusted, so
 * two corrections do not compound — and an addition performed here would drift
 * from the recomposed figure the moment that happens.
 *
 * There is no `+` anywhere in this file.
 *
 * ## Before the fee there is no total, and the card says so (§17)
 *
 * `911:313` states the rule the customer sees: *chưa có mã QR và chưa có tổng
 * tiền — cả hai chỉ xuất hiện sau khi phí được xác nhận*. The contract enforces
 * it physically — `payment` and `delivery.feeAmount` are **absent**, not zero,
 * which is why no `0 VND` can be rendered by accident — and this component
 * renders the pending line in the highlight's place rather than a figure.
 *
 * The fee row is likewise omitted rather than shown empty: *not priced yet* and
 * *priced at nothing* have to be different answers on the screen, exactly as
 * they are on the wire.
 *
 * ## After payment the total stays, and says it was paid (`APP12-U01-C1` F2)
 *
 * `full` is read only while the order is `AWAITING_PAYMENT` (§14), and the card
 * used to fall back to the pending-fee sentence everywhere else — so a paid,
 * delivered order told its customer the fee was still to come. Once the
 * obligation is `SATISFIED` the projection still carries its frozen figure, and
 * the card shows it as `Tổng đã thanh toán`: no copy button, because there is
 * nothing left to transfer, and a title that no longer asks for money.
 */
interface OrderAmountCardProps {
  readonly order: ReadyMadeOrderAccessResponse;
  /** The live obligation, present only while the order is payable. */
  readonly full: CustomerFullPaymentResponse | undefined;
  /** Whether the exact payable figure may be highlighted at all. */
  readonly showsTotal: boolean;
}

export function OrderAmountCard({ order, full, showsTotal }: OrderAmountCardProps) {
  const fee = order.delivery?.feeAmount;
  const highlight = amountHighlightOf(order, showsTotal, full);
  const asksForMoney = highlight === 'PAYABLE' || highlight === 'PENDING_FEE';

  return (
    <section className="secure-order__card" aria-labelledby="secure-order-amount">
      <h2 className="secure-order__card-title" id="secure-order-amount">
        {asksForMoney ? COPY.amount.title : COPY.amount.summaryTitle}
      </h2>

      {renderHighlight()}

      <dl className="secure-order__facts">
        <div className="secure-order__fact">
          <dt className="secure-order__fact-label">{COPY.amount.merchandiseLabel}</dt>
          <dd className="secure-order__fact-value">
            {formatExactMoney(order.merchandiseSubtotal, order.currencyCode)}
          </dd>
        </div>
        {/*
          Rendered only once an operator has set it. An absent fee is not a zero
          fee, and printing `0 VND` here would be this screen inventing the one
          figure `BR-027` says does not exist yet.
        */}
        {fee === undefined ? null : (
          <div className="secure-order__fact">
            <dt className="secure-order__fact-label">{COPY.amount.feeLabel}</dt>
            <dd className="secure-order__fact-value">
              {formatExactMoney(fee, order.currencyCode)}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );

  function renderHighlight() {
    if (highlight === 'PAYABLE' && full !== undefined) {
      return (
        <div className="secure-order__highlight">
          <p className="secure-order__highlight-label">{COPY.amount.highlightLabel}</p>
          <p className="secure-order__highlight-value">
            <span className="secure-order__highlight-number">
              {formatExactAmount(full.fullPaymentAmount)}
            </span>{' '}
            <span className="secure-order__highlight-currency">{full.currencyCode}</span>
          </p>
          <CopyValueButton
            value={full.fullPaymentAmount}
            label={COPY.copy.amount}
            doneMessage={COPY.copy.doneAmount}
          />
        </div>
      );
    }

    const settled = order.payment;
    if (highlight === 'SETTLED' && settled !== undefined) {
      return (
        <div className="secure-order__highlight" data-testid="secure-order-settled-total">
          <p className="secure-order__highlight-label">{COPY.amount.settledLabel}</p>
          <p className="secure-order__highlight-value">
            <span className="secure-order__highlight-number">
              {formatExactAmount(settled.payableTotal)}
            </span>{' '}
            <span className="secure-order__highlight-currency">{order.currencyCode}</span>
          </p>
        </div>
      );
    }

    if (highlight === 'PENDING_FEE') {
      return (
        <p className="secure-order__highlight secure-order__highlight--pending">
          <span className="secure-order__highlight-label">{COPY.amount.highlightLabel}</span>
          <span className="secure-order__highlight-pending">{COPY.amount.pendingFee}</span>
        </p>
      );
    }

    return null;
  }
}
