'use client';

import type {
  CustomerFinalPaymentResponse,
  FinalPaymentAttemptResponse,
} from '@embroidery/api-client';

import { formatInstant } from '../model/display-format';
import { formatExactAmount } from '../model/exact-final-amount';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { CopyValueButton } from './copy-value-button';
import { FinalPaymentNote } from './final-payment-note';

/**
 * `816:22` and `816:34` / `819:4` — the manual bank transfer, stated in full.
 *
 * ## Every figure is the server's, and none of them is editable
 *
 * The amount is the `REMAINING` obligation's own frozen figure; the reference is
 * fifteen characters the server derived from the order code and the `RM`
 * obligation kind and returns identically on every read and every retry; the
 * bank, the account and the holder are server-owned configuration. They are
 * rendered as text, not as inputs — there is no control on this screen through
 * which a customer could change any of them, which is a stronger statement than
 * a `readOnly` attribute because there is nothing to un-set.
 *
 * Nothing here constructs a VietQR payload, and no merchant bank value is
 * hard-coded: every field below arrives in `bankInstructions`, and the encoded
 * form of the same facts arrives as PNG bytes from the server (§9).
 *
 * ## One amount, four places, one string
 *
 * The attempt's `amount` and the read's `finalPaymentAmount` are the same frozen
 * figure — `APP9-B02` opens the attempt *at* the obligation's exact amount — so
 * the hero, the copy control, the QR and the pre-attempt highlight cannot
 * disagree. The attempt's copy is used here because it is the one the customer's
 * own action returned.
 *
 * ## Waiting is described truthfully
 *
 * There is no *Tôi đã chuyển khoản* button anywhere in this feature, and the
 * approved copy says why in the customer's own words: the system has no way to
 * verify such a claim, so a button would only record a click. `820:44` records
 * that *hướng dẫn đã mở* and *đang chờ xác nhận* are one customer state, because
 * `publicOrderFinalPayment_current` answers `PENDING` for both — so this card
 * *is* the waiting card, and there is no second panel to move to.
 */
interface TransferInstructionsCardProps {
  readonly payment: CustomerFinalPaymentResponse;
  readonly attempt: FinalPaymentAttemptResponse;
}

export function TransferInstructionsCard({ payment, attempt }: TransferInstructionsCardProps) {
  const bank = payment.bankInstructions;

  return (
    <>
      <section className="secure-final-payment__card" aria-labelledby="final-payment-amount">
        <h2 className="secure-final-payment__card-title" id="final-payment-amount">
          {COPY.instructions.amountTitle}
        </h2>
        <div className="secure-final-payment__hero">
          <p className="secure-final-payment__hero-value">
            <span className="secure-final-payment__hero-number">
              {formatExactAmount(attempt.amount)}
            </span>{' '}
            <span className="secure-final-payment__hero-currency">{attempt.currencyCode}</span>
          </p>
          <p className="secure-final-payment__body">{COPY.instructions.amountNote}</p>
          <CopyValueButton
            value={attempt.amount}
            label={COPY.copy.amount}
            doneMessage={COPY.copy.doneAmount}
          />
        </div>
      </section>

      <section className="secure-final-payment__card" aria-labelledby="final-payment-transfer">
        <h2 className="secure-final-payment__card-title" id="final-payment-transfer">
          {COPY.instructions.panelTitle}
        </h2>
        <p className="secure-final-payment__body">{COPY.instructions.panelLead}</p>

        <dl className="secure-final-payment__facts">
          <div className="secure-final-payment__fact">
            <dt className="secure-final-payment__fact-label">{COPY.instructions.bankLabel}</dt>
            <dd className="secure-final-payment__fact-value">{bank.bankDisplayName}</dd>
          </div>
          <div className="secure-final-payment__fact">
            <dt className="secure-final-payment__fact-label">
              {COPY.instructions.accountNumberLabel}
            </dt>
            <dd className="secure-final-payment__fact-value">
              <span className="secure-final-payment__account">{bank.accountNumber}</span>
              <CopyValueButton
                value={bank.accountNumber}
                label={COPY.copy.accountNumber}
                doneMessage={COPY.copy.doneAccountNumber}
              />
            </dd>
          </div>
          <div className="secure-final-payment__fact">
            <dt className="secure-final-payment__fact-label">
              {COPY.instructions.accountNameLabel}
            </dt>
            <dd className="secure-final-payment__fact-value">{bank.accountName}</dd>
          </div>
          <div className="secure-final-payment__fact secure-final-payment__fact--accent">
            <dt className="secure-final-payment__fact-label">{COPY.instructions.referenceLabel}</dt>
            <dd className="secure-final-payment__fact-value">
              <span className="secure-final-payment__reference">{attempt.transferReference}</span>
              <CopyValueButton
                value={attempt.transferReference}
                label={COPY.copy.reference}
                doneMessage={COPY.copy.doneReference}
              />
            </dd>
          </div>
        </dl>

        <FinalPaymentNote tone="INFO">{COPY.instructions.referenceNote}</FinalPaymentNote>
      </section>

      <section className="secure-final-payment__card" aria-labelledby="final-payment-waiting">
        <h2 className="secure-final-payment__card-title" id="final-payment-waiting">
          <span className="secure-final-payment__card-symbol" aria-hidden="true">
            ◷
          </span>
          {COPY.instructions.waitingTitle}
        </h2>
        <p className="secure-final-payment__body">{COPY.instructions.waitingBody}</p>
        <FinalPaymentNote tone="INFO">
          {`${COPY.instructions.expiryPrefix} ${formatInstant(payment.accessExpiresAt)}. ${COPY.instructions.expirySuffix}`}
        </FinalPaymentNote>
      </section>
    </>
  );
}
