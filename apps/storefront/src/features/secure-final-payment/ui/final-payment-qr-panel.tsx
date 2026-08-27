'use client';

import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import type { FinalPaymentQr } from '../hooks/use-final-payment-qr';
import { FinalPaymentNote } from './final-payment-note';

/**
 * `816:63` / `819:4` — the QR, and the sentence that makes it optional.
 *
 * ## The QR is a shortcut, never the channel
 *
 * Everything the image encodes — the account, the amount, the `RM` reference —
 * is already printed as readable text beside it by the instructions card, so a
 * failed fetch, a browser with no object URLs and a camera that cannot focus all
 * degrade to the same fully usable page. That is why a fetch failure renders a
 * line and a retry rather than an error state that swallows the panel.
 *
 * ## Scanning is not paying, and the frame says so in place
 *
 * `816:222` carries the sentence as part of the approved design rather than as
 * fine print: quét mã hoặc chuyển tiền **không** có nghĩa là đã thanh toán
 * xong. `APP9-S01` §9 requires that disclaimer to be primary, so it sits inside
 * the panel the customer is looking at while they scan, not at the bottom of the
 * page. There is no provider checkout behind this image, no webhook that will
 * change it, and nothing polls a bank on the customer's behalf.
 *
 * ## The alternative text describes the purpose, not the pixels
 *
 * "A QR code" tells a screen-reader user nothing they can act on. The alt text
 * says what the code is *for*, and every datum inside it exists as text nearby.
 *
 * ## Download reuses the bytes already fetched
 *
 * The button is a real button with a label, not a bare icon, and it spends no
 * second request: the same authorized blob is handed to the browser through the
 * object URL the panel is already displaying.
 */
interface FinalPaymentQrPanelProps {
  readonly qr: FinalPaymentQr;
}

export function FinalPaymentQrPanel({ qr }: FinalPaymentQrPanelProps) {
  return (
    <section className="secure-final-payment__qr" aria-labelledby="final-payment-qr-title">
      <h2 className="secure-final-payment__card-title" id="final-payment-qr-title">
        {COPY.qr.title}
      </h2>

      <p className="secure-final-payment__visually-hidden" aria-live="polite">
        {announcement()}
      </p>

      <div className="secure-final-payment__qr-frame">{renderImage()}</div>

      <p className="secure-final-payment__fine-print">{COPY.qr.hint}</p>

      <button
        type="button"
        className="secure-final-payment__button secure-final-payment__button--primary"
        onClick={qr.download}
        disabled={qr.objectUrl === undefined}
      >
        {COPY.qr.download}
      </button>

      <FinalPaymentNote tone="WARNING">{COPY.qr.truth}</FinalPaymentNote>

      <p className="secure-final-payment__fine-print">{COPY.qr.fallback}</p>
    </section>
  );

  function announcement(): string {
    if (qr.loading) return COPY.live.qrLoading;
    return qr.objectUrl === undefined ? '' : COPY.live.qrReady;
  }

  function renderImage() {
    if (qr.objectUrl !== undefined) {
      // `next/image` optimizes through a loader that fetches the source itself.
      // The source here is a `blob:` URL for bytes that already arrived over an
      // authorized POST and are never stored, so there is nothing for a loader to
      // fetch and nothing that may be handed to one. A plain `img` is the only
      // correct element for it.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="secure-final-payment__qr-image" src={qr.objectUrl} alt={COPY.qr.alt} />
      );
    }
    if (qr.loading) {
      return <p className="secure-final-payment__qr-placeholder">{COPY.qr.loading}</p>;
    }
    return (
      <div className="secure-final-payment__qr-placeholder">
        <p>{COPY.qr.failed}</p>
        <button type="button" className="secure-final-payment__button" onClick={qr.retry}>
          {COPY.qr.retry}
        </button>
      </div>
    );
  }
}
