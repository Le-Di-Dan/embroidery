'use client';

import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { FinalPaymentNote } from './final-payment-note';

/**
 * `818:16` — the balance exists but is not collectable yet.
 *
 * ## Nothing about the money is on this screen
 *
 * No amount, no account number, no transfer reference and no QR. That is not
 * caution, it is the frame: `818:22` states in place that the page *does not*
 * show a figure while the balance is closed, and `APP9-S01` §7 forbids enabling
 * QR generation or attempt initiation when `payable` is false. So this card
 * renders neither control, and the QR query is never enabled behind it — a
 * request the server would answer `409 FINAL_PAYMENT_NOT_PAYABLE` is simply
 * never made.
 *
 * The `finalPaymentAmount` in the response is real and truthful here — the read
 * answers honestly in every state — but printing an amount beside "you do not
 * need to pay yet" is how a customer ends up transferring money nobody has asked
 * for. `820:19` settles it: *chưa hiện số tiền, số tài khoản hay QR*.
 *
 * ## And no reason is invented for *why* it is closed
 *
 * `payable` is one boolean. The response does not say whether production is
 * unfinished, whether an operator has yet to open the window, or which of the
 * eleven order states applies — and §7 forbids inventing separate visual states
 * for subcases the API does not distinguish. The customer label beside the
 * heading is the one distinction the contract does support, and it comes from
 * `orderStatus` through the approved mapping.
 */
export function NotPayableCard() {
  return (
    <section className="secure-final-payment__card" aria-labelledby="final-payment-not-payable">
      <h2 className="secure-final-payment__card-title" id="final-payment-not-payable">
        <span className="secure-final-payment__card-symbol" aria-hidden="true">
          ◷
        </span>
        {COPY.notPayable.cardTitle}
      </h2>
      <p className="secure-final-payment__body">{COPY.notPayable.body}</p>
      <FinalPaymentNote tone="INFO">{COPY.notPayable.note}</FinalPaymentNote>
    </section>
  );
}
