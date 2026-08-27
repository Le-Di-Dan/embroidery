'use client';

import type { CustomerFinalPaymentResponse } from '@embroidery/api-client';

import { formatExactAmount } from '../model/exact-final-amount';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import type { NoticeableInitiateFailure } from '../model/final-payment-failure';
import { FinalPaymentNote } from './final-payment-note';

/**
 * `816:246` / `816:260` — the balance is payable and no attempt is open yet.
 *
 * ## The exact amount is the anchor, and it is the server's
 *
 * `finalPaymentAmount` is the `REMAINING` obligation's own frozen figure, copied
 * from the accepted quotation at order creation. It is printed through
 * {@link formatExactAmount}, which does string work only: no coercion, no
 * rounding, no arithmetic. The same string is what the instructions card, the
 * QR request and the attempt all carry, so no two places on this route can
 * disagree about what is owed.
 *
 * ## The two summary rows the approved frame draws are absent
 *
 * `816:251` and `816:254` print *Tổng đơn hàng* and *Đã đặt cọc*. The delivered
 * customer projection carries neither, and every route to them is forbidden —
 * see {@link OrderFactsCard} for the full reasoning. The highlighted balance is
 * the row that survives, which is also the row the frame makes the visual anchor.
 *
 * ## Why the button says what it says
 *
 * It fetches instructions; it does not pay. The body text warns that a single
 * re-verification will be asked for, because `APP9-B02` requires a recent
 * step-up before it will open an attempt and a customer surprised by an OTP on a
 * payment page is a customer who abandons it.
 */
interface PreAttemptCardProps {
  readonly payment: CustomerFinalPaymentResponse;
  readonly initiating: boolean;
  readonly failure: NoticeableInitiateFailure | undefined;
  readonly onStart: () => void;
}

export function PreAttemptCard({ payment, initiating, failure, onStart }: PreAttemptCardProps) {
  return (
    <>
      <section className="secure-final-payment__card" aria-labelledby="final-payment-summary">
        <h2 className="secure-final-payment__card-title" id="final-payment-summary">
          {COPY.preAttempt.summaryTitle}
        </h2>

        <dl className="secure-final-payment__facts">
          <div className="secure-final-payment__fact">
            <dt className="secure-final-payment__fact-label">{COPY.order.codeLabel}</dt>
            <dd className="secure-final-payment__fact-value">{payment.orderCode}</dd>
          </div>
        </dl>

        <div className="secure-final-payment__highlight">
          <p className="secure-final-payment__highlight-label">{COPY.preAttempt.highlightLabel}</p>
          <p className="secure-final-payment__highlight-value">
            <span className="secure-final-payment__highlight-number">
              {formatExactAmount(payment.finalPaymentAmount)}
            </span>{' '}
            <span className="secure-final-payment__highlight-currency">{payment.currencyCode}</span>
          </p>
        </div>
      </section>

      <section
        className="secure-final-payment__card secure-final-payment__card--accent"
        aria-labelledby="final-payment-start"
      >
        <h2 className="secure-final-payment__card-title" id="final-payment-start">
          {COPY.preAttempt.startTitle}
        </h2>
        <p className="secure-final-payment__body">{COPY.preAttempt.startBody}</p>

        <button
          type="button"
          className="secure-final-payment__button secure-final-payment__button--primary"
          onClick={onStart}
          disabled={initiating}
        >
          {initiating ? COPY.preAttempt.starting : COPY.preAttempt.startAction}
        </button>

        {failure === undefined ? null : (
          <FinalPaymentNote tone="WARNING">{COPY.initiateFailure[failure]}</FinalPaymentNote>
        )}
      </section>
    </>
  );
}
