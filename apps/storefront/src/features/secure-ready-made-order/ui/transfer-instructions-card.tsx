'use client';

import type { CustomerFullPaymentResponse } from '@embroidery/api-client';

import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { CopyValueButton } from './copy-value-button';
import { OrderNote } from './order-note';

/**
 * `910:306`…`910:324` — the manual bank transfer, stated in full.
 *
 * ## Every figure is the server's, and none of them is editable
 *
 * The bank, the account, the holder and the transfer reference all arrive in
 * `bankInstructions`. They are rendered as text, not as inputs — there is no
 * control on this screen through which a customer could change any of them,
 * which is a stronger statement than a `readOnly` attribute because there is
 * nothing to un-set. Nothing here constructs a VietQR payload and no merchant
 * bank value is hard-coded; the encoded form of these same facts arrives as PNG
 * bytes from the server (§17).
 *
 * ## This card *is* the textual QR fallback (§57)
 *
 * Every datum the image encodes — the account, the exact amount and the `FL`
 * reference — is printed here as selectable, copyable text. `910:329` says so
 * to the customer in as many words. So a failed QR fetch, a browser with no
 * object URLs and a camera that cannot focus all degrade to a page that is
 * still completely usable, and the fallback is a property of the layout rather
 * than a promise made in a doc comment.
 *
 * ## The reference names the order, not the obligation
 *
 * Fifteen uppercase characters derived from the order code and the `FL`
 * obligation kind, identical on every read, every retry **and across a
 * shipping-fee correction**. That last property is deliberate on the server's
 * part: a transfer sent before a correction still reconciles. It is also why
 * §24's stale-attempt check compares amounts rather than references — the
 * reference cannot distinguish a superseded obligation from its successor.
 *
 * ## Waiting is described truthfully
 *
 * There is no *tôi đã chuyển khoản* button anywhere in this feature. `917:596`
 * removes it from this surface by name, and the reason is that the system has
 * no way to verify such a claim — a button would only record a click. The card
 * carries the waiting sentence itself, and §27 is what it obeys: nothing the
 * customer does here can make the page say the payment is verified.
 */
interface TransferInstructionsCardProps {
  readonly full: CustomerFullPaymentResponse;
}

export function TransferInstructionsCard({ full }: TransferInstructionsCardProps) {
  const bank = full.bankInstructions;

  return (
    <section className="secure-order__card" aria-labelledby="secure-order-transfer">
      <h2 className="secure-order__card-title" id="secure-order-transfer">
        {COPY.transfer.title}
      </h2>

      <dl className="secure-order__facts">
        <div className="secure-order__fact">
          <dt className="secure-order__fact-label">{COPY.transfer.bankLabel}</dt>
          <dd className="secure-order__fact-value">{bank.bankDisplayName}</dd>
        </div>

        <div className="secure-order__fact">
          <dt className="secure-order__fact-label">{COPY.transfer.accountNameLabel}</dt>
          <dd className="secure-order__fact-value">{bank.accountName}</dd>
        </div>

        <div className="secure-order__fact">
          <dt className="secure-order__fact-label">{COPY.transfer.accountNumberLabel}</dt>
          <dd className="secure-order__fact-value">
            <span className="secure-order__account">{bank.accountNumber}</span>
            <CopyValueButton
              value={bank.accountNumber}
              label={COPY.copy.accountNumber}
              doneMessage={COPY.copy.doneAccountNumber}
            />
          </dd>
        </div>

        <div className="secure-order__fact secure-order__fact--accent">
          <dt className="secure-order__fact-label">{COPY.transfer.referenceLabel}</dt>
          <dd className="secure-order__fact-value">
            <span className="secure-order__reference">{bank.transferReference}</span>
            <CopyValueButton
              value={bank.transferReference}
              label={COPY.copy.reference}
              doneMessage={COPY.copy.doneReference}
            />
          </dd>
        </div>
      </dl>

      {/* `910:324` — the one supporting line `917:595` allows this surface. */}
      <OrderNote tone="INFO">{COPY.transfer.referenceNote}</OrderNote>
    </section>
  );
}
