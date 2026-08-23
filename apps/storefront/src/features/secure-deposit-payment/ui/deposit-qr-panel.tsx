'use client';

import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import type { DepositQr } from '../hooks/use-deposit-qr';

/**
 * `745:52` / `750:40` — the QR, and the sentence that makes it optional.
 *
 * ## The QR is a shortcut, never the channel
 *
 * `753:147` is unambiguous: the customer must be able to complete the transfer
 * without ever using the code. Everything the image encodes — the account, the
 * amount, the reference — is already printed as readable text beside it by
 * {@link DepositInstructionsCard}, so a failed fetch, a browser with no object
 * URLs and a camera that cannot focus all degrade to the same fully usable page.
 * That is why a fetch failure renders a line and a retry rather than an error
 * state that swallows the panel.
 *
 * ## The alternative text describes the purpose, not the pixels
 *
 * "A QR code" tells a screen-reader user nothing they can act on. The approved
 * requirement (`753:144`) is that the alt text say what the code is *for* and
 * that every datum inside it exist as text nearby — both of which hold here.
 *
 * ## Download reuses the bytes already fetched
 *
 * The button is a real button with a label, not a bare icon (`753:150`), and it
 * spends no second request: the same authorized blob is handed to the browser
 * through the object URL the panel is already displaying (§10).
 */
interface DepositQrPanelProps {
  readonly qr: DepositQr;
}

export function DepositQrPanel({ qr }: DepositQrPanelProps) {
  return (
    <section className="secure-deposit__qr" aria-labelledby="secure-deposit-qr-title">
      <h2 className="secure-deposit__card-title" id="secure-deposit-qr-title">
        {COPY.qr.title}
      </h2>

      <p className="secure-deposit__visually-hidden" aria-live="polite">
        {announcement()}
      </p>

      <div className="secure-deposit__qr-frame">{renderImage()}</div>

      <button
        type="button"
        className="secure-deposit__button secure-deposit__button--primary"
        onClick={qr.download}
        disabled={qr.objectUrl === undefined}
      >
        {COPY.qr.download}
      </button>

      <p className="secure-deposit__fine-print">{COPY.qr.fallback}</p>
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
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="secure-deposit__qr-image" src={qr.objectUrl} alt={COPY.qr.alt} />;
    }
    if (qr.loading) {
      return <p className="secure-deposit__qr-placeholder">{COPY.qr.loading}</p>;
    }
    return (
      <div className="secure-deposit__qr-placeholder">
        <p>{COPY.qr.failed}</p>
        <button type="button" className="secure-deposit__button" onClick={qr.retry}>
          {COPY.qr.retry}
        </button>
      </div>
    );
  }
}
