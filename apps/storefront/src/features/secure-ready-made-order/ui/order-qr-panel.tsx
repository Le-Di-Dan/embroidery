'use client';

import type { FullPaymentQr } from '../hooks/use-full-payment-qr';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { OrderNote } from './order-note';

/**
 * `910:325`…`910:329` desktop, `911:415`…`911:419` mobile — the QR, and the
 * sentence that makes it optional.
 *
 * ## The QR is a shortcut, never the channel
 *
 * Everything the image encodes — the account, the exact amount, the `FL`
 * reference — is already printed as readable text by the transfer card, so a
 * failed fetch, a browser with no object URLs and a camera that cannot focus
 * all degrade to the same fully usable page. That is why a fetch failure
 * renders a line and a retry rather than an error state that swallows the
 * panel, and it is what §57 asks for.
 *
 * The hint line is the design's own statement of the same thing. The two frames
 * differ by one directional word because the panel moves between the aside and
 * the stack; this route mounts **one** panel and places it with CSS, so the
 * sentence names its destination rather than a direction that would be wrong at
 * one of the two widths. See `model/order-access-copy.ts`.
 *
 * ## Scanning is not paying, and the frame says so in place (§27)
 *
 * The disclaimer sits inside the panel the customer is looking at while they
 * scan, following the `APP9-D01` `816:222` convention this package reuses.
 * There is no provider checkout behind this image, no webhook that will change
 * it, and nothing polls a bank on the customer's behalf. Only an Admin
 * verification can settle the obligation.
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
interface OrderQrPanelProps {
  readonly qr: FullPaymentQr;
}

export function OrderQrPanel({ qr }: OrderQrPanelProps) {
  return (
    <section className="secure-order__qr" aria-labelledby="secure-order-qr-title">
      <h2 className="secure-order__card-title" id="secure-order-qr-title">
        {COPY.qr.title}
      </h2>

      <p className="secure-order__visually-hidden" aria-live="polite">
        {announcement()}
      </p>

      <div className="secure-order__qr-frame">{renderImage()}</div>

      <p className="secure-order__fine-print">{COPY.qr.hint}</p>

      <button
        type="button"
        className="secure-order__button"
        onClick={qr.download}
        disabled={qr.objectUrl === undefined}
      >
        {COPY.qr.download}
      </button>

      <OrderNote tone="WARNING">{COPY.qr.truth}</OrderNote>
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
      // authorized POST and are never stored, so there is nothing for a loader
      // to fetch and nothing that may be handed to one. A plain `img` is the
      // only correct element for it.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="secure-order__qr-image" src={qr.objectUrl} alt={COPY.qr.alt} />
      );
    }
    if (qr.loading) {
      return <p className="secure-order__qr-placeholder">{COPY.qr.loading}</p>;
    }
    return (
      <div className="secure-order__qr-placeholder">
        <p>{COPY.qr.failed}</p>
        <button type="button" className="secure-order__button" onClick={qr.retry}>
          {COPY.qr.retry}
        </button>
      </div>
    );
  }
}
