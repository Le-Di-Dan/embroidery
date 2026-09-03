'use client';

import type { CustomerDepositResponse } from '@embroidery/api-client';

import { formatExactAmount } from '../../../shared/money/exact-money';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import type { NoticeableInitiateFailure } from '../model/deposit-failure';
import { DepositNote } from './deposit-note';

/**
 * `747:3` — the order exists and no attempt has been opened yet.
 *
 * ## The one row that is not drawn
 *
 * The approved frame shows *Tổng giá trị đơn hàng — 12.750.000 VND* between the
 * order code and the deposit. `publicOrderDeposit_current` publishes no order
 * total: it returns the order code, the order and obligation status, the
 * obligation's own amount, the currency, the bank instructions and the access
 * expiry. §39 says to simplify to actual backend truth and record the
 * discrepancy rather than reach for another operation or derive the figure, and
 * deriving is precisely what this whole feature exists not to do — a total
 * inferred from a 40 % deposit would be the recomputation §11 forbids, spelled
 * backwards. The row is therefore absent, and the completion report names it.
 *
 * The deposit figure itself is the obligation's frozen amount, printed as the
 * server sent it.
 *
 * ## Why the button says what it says
 *
 * It fetches instructions; it does not pay. The body text warns that a single
 * re-verification will be asked for, because `APP7-B03` requires a recent
 * step-up before it will open an attempt and a customer surprised by an OTP on a
 * payment page is a customer who abandons it.
 */
interface DepositPreAttemptCardProps {
  readonly deposit: CustomerDepositResponse;
  readonly initiating: boolean;
  readonly failure: NoticeableInitiateFailure | undefined;
  readonly onStart: () => void;
}

export function DepositPreAttemptCard({
  deposit,
  initiating,
  failure,
  onStart,
}: DepositPreAttemptCardProps) {
  return (
    <>
      <p className="secure-deposit__lead">{COPY.preAttempt.lead}</p>

      <section className="secure-deposit__card" aria-labelledby="secure-deposit-summary">
        <h2 className="secure-deposit__card-title" id="secure-deposit-summary">
          {COPY.preAttempt.summaryTitle}
        </h2>

        <dl className="secure-deposit__facts">
          <div className="secure-deposit__fact">
            <dt className="secure-deposit__fact-label">{COPY.preAttempt.orderCodeLabel}</dt>
            <dd className="secure-deposit__fact-value">{deposit.orderCode}</dd>
          </div>
          <div className="secure-deposit__fact secure-deposit__fact--accent">
            <dt className="secure-deposit__fact-label">{COPY.preAttempt.depositLabel}</dt>
            <dd className="secure-deposit__fact-value secure-deposit__fact-value--amount">
              {formatExactAmount(deposit.depositAmount)} {deposit.currencyCode}
            </dd>
          </div>
          <div className="secure-deposit__fact">
            <dt className="secure-deposit__fact-label">{COPY.preAttempt.currencyLabel}</dt>
            <dd className="secure-deposit__fact-value">{deposit.currencyCode}</dd>
          </div>
        </dl>

        <p className="secure-deposit__fine-print">{COPY.preAttempt.remainderNote}</p>
      </section>

      <section
        className="secure-deposit__card secure-deposit__card--accent"
        aria-labelledby="secure-deposit-start"
      >
        <h2 className="secure-deposit__card-title" id="secure-deposit-start">
          {COPY.preAttempt.startTitle}
        </h2>
        <p className="secure-deposit__body">{COPY.preAttempt.startBody}</p>

        <button
          type="button"
          className="secure-deposit__button secure-deposit__button--primary"
          onClick={onStart}
          disabled={initiating}
        >
          {initiating ? COPY.preAttempt.starting : COPY.preAttempt.startAction}
        </button>

        {failure === undefined ? null : (
          <DepositNote tone="WARNING">{COPY.initiateFailure[failure]}</DepositNote>
        )}
      </section>
    </>
  );
}
