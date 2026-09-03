'use client';

import type { CustomerFinalPaymentResponse } from '@embroidery/api-client';

import { formatExactAmount } from '../../../shared/money/exact-money';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';

/**
 * `818:23` / `818:70` / `818:120` / `818:170` — the order's own facts, reduced
 * to the ones the delivered contract actually carries.
 *
 * ## Two approved rows are deliberately not drawn
 *
 * The approved frames print four rows: *Mã đơn hàng*, *Tổng đơn hàng*, *Đã đặt
 * cọc* and *Đã thanh toán phần còn lại*. `CustomerFinalPaymentResponse` — the
 * only customer projection APP9 delivered — publishes `orderCode`,
 * `orderStatus`, `finalPaymentAmount`, `finalPaymentStatus`, `payable`,
 * `bankInstructions` and `accessExpiresAt`. There is **no order total and no
 * deposit amount** anywhere in it.
 *
 * Every way of filling those two rows is forbidden by `APP9-S01`:
 *
 * - deriving them is the `total − deposit` arithmetic §6 and §8 forbid outright,
 *   run backwards — and a `B04` shipping-fee increase falsifies it, which is the
 *   same reason `FIG-APP9-A01-DETAIL-AWAITINGFINAL-DESKTOP` forbids it on the
 *   Admin side;
 * - reading the deposit lane's `publicOrderDeposit_current` would put a second
 *   obligation's figure on a `REMAINING`-only surface and would still not yield
 *   an order total;
 * - reading the quotation is inferring the amount from quotation totals, which
 *   §6 names explicitly.
 *
 * So the rows are absent, and the completion report names the gap. The one money
 * row that survives is the obligation's own frozen figure, printed exactly as
 * the server sent it. `APP7-S01` made the same call for the same reason on the
 * deposit screen (`747:3`'s missing total row), so this is a precedent followed
 * rather than a new judgement.
 */
interface OrderFactsCardProps {
  readonly payment: CustomerFinalPaymentResponse;
  /** Whether the balance row reads as already paid or as still owed. */
  readonly settled: boolean;
}

export function OrderFactsCard({ payment, settled }: OrderFactsCardProps) {
  return (
    <section className="secure-final-payment__card" aria-labelledby="final-payment-facts">
      <h2 className="secure-final-payment__card-title" id="final-payment-facts">
        {COPY.order.factsTitle}
      </h2>
      <dl className="secure-final-payment__facts">
        <div className="secure-final-payment__fact">
          <dt className="secure-final-payment__fact-label">{COPY.order.codeLabel}</dt>
          <dd className="secure-final-payment__fact-value">{payment.orderCode}</dd>
        </div>
        {settled ? (
          <div className="secure-final-payment__fact">
            <dt className="secure-final-payment__fact-label">{COPY.order.paidRemainingLabel}</dt>
            <dd className="secure-final-payment__fact-value">
              {`${formatExactAmount(payment.finalPaymentAmount)} ${payment.currencyCode}`}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
