'use client';

import type { CustomerDepositResponse, DepositAttemptResponse } from '@embroidery/api-client';

import { formatInstant } from '../model/display-format';
import { formatExactAmount } from '../model/exact-deposit-amount';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { CopyValueButton } from './copy-value-button';
import { DepositNote } from './deposit-note';

/**
 * `745:3` / `750:3` — the manual bank transfer, stated in full.
 *
 * ## Every figure is the server's, and none of them is editable
 *
 * The amount is the `DEPOSIT` obligation's own frozen figure; the reference is
 * fifteen characters the server derived from the order code and returns
 * identically on every read; the bank, the account and the holder are
 * server-owned configuration. They are rendered as `<dd>` text, not as inputs —
 * there is no control on this screen through which a customer could change any
 * of them, which is a stronger statement than a `readOnly` attribute because
 * there is nothing to un-set.
 *
 * The transfer reference is printed in a `<span>` that never trims, folds case
 * or re-groups it, and the copy control copies exactly that string. §7 and §11
 * both turn on this: a "tidied" reference is a transfer the workshop cannot
 * match to an order.
 *
 * ## The reading order is the approved focus order
 *
 * `753:169` fixes it: amount → copy amount → reference → copy reference →
 * account → copy account → download QR → upload image → retry. The DOM order
 * below is that order, so the tab order follows without a single `tabindex`.
 *
 * ## Waiting is described truthfully
 *
 * There is no *Tôi đã chuyển khoản* button anywhere in this feature, and the
 * approved copy says why in the customer's own words: the system has no way to
 * verify such a claim, so a button would only record a click. The screen changes
 * when the workshop confirms the money arrived, and not before.
 */
interface DepositInstructionsCardProps {
  readonly deposit: CustomerDepositResponse;
  readonly attempt: DepositAttemptResponse;
}

export function DepositInstructionsCard({ deposit, attempt }: DepositInstructionsCardProps) {
  const bank = deposit.bankInstructions;

  return (
    <section className="secure-deposit__card" aria-labelledby="secure-deposit-transfer">
      <h2 className="secure-deposit__card-title" id="secure-deposit-transfer">
        {COPY.instructions.panelTitle}
      </h2>

      <div className="secure-deposit__hero">
        <p className="secure-deposit__hero-label">{COPY.instructions.amountLabel}</p>
        <p className="secure-deposit__hero-value">
          <span className="secure-deposit__hero-number">{formatExactAmount(attempt.amount)}</span>{' '}
          <span className="secure-deposit__hero-currency">{attempt.currencyCode}</span>
        </p>
        <CopyValueButton
          value={attempt.amount}
          label={COPY.copy.amount}
          doneMessage={COPY.copy.doneAmount}
        />
      </div>

      <div className="secure-deposit__hero secure-deposit__hero--reference">
        <p className="secure-deposit__hero-label">{COPY.instructions.referenceLabel}</p>
        <p className="secure-deposit__hero-value">
          <span className="secure-deposit__reference">{attempt.transferReference}</span>
        </p>
        <CopyValueButton
          value={attempt.transferReference}
          label={COPY.copy.reference}
          doneMessage={COPY.copy.doneReference}
        />
      </div>

      <p className="secure-deposit__fine-print">{COPY.instructions.referenceNote}</p>

      <dl className="secure-deposit__facts">
        <div className="secure-deposit__fact">
          <dt className="secure-deposit__fact-label">{COPY.instructions.bankLabel}</dt>
          <dd className="secure-deposit__fact-value">{bank.bankDisplayName}</dd>
        </div>
        <div className="secure-deposit__fact">
          <dt className="secure-deposit__fact-label">{COPY.instructions.accountNumberLabel}</dt>
          <dd className="secure-deposit__fact-value">
            <span className="secure-deposit__account">{bank.accountNumber}</span>
            <CopyValueButton
              value={bank.accountNumber}
              label={COPY.copy.accountNumber}
              doneMessage={COPY.copy.doneAccountNumber}
            />
          </dd>
        </div>
        <div className="secure-deposit__fact">
          <dt className="secure-deposit__fact-label">{COPY.instructions.accountNameLabel}</dt>
          <dd className="secure-deposit__fact-value">{bank.accountName}</dd>
        </div>
      </dl>

      <DepositNote tone="INFO">
        {`${COPY.instructions.expiryPrefix} ${formatInstant(deposit.accessExpiresAt)}. ${COPY.instructions.expirySuffix}`}
      </DepositNote>
    </section>
  );
}
