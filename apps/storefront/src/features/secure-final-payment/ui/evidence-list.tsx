import type { TransferEvidenceItemResponse } from '@embroidery/api-client';

import { formatByteSize, formatInstant } from '../model/display-format';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { evidenceToneOf } from '../model/transfer-evidence';
import { FinalPaymentPill, type PillTone } from './final-payment-pill';

/**
 * The images already submitted for one attempt (`817:31`).
 *
 * ## Metadata only, because that is all there is
 *
 * `evidenceId`, `assetStatus`, `mediaType`, `byteSize`, `createdAt` — the five
 * fields the customer contract publishes, and nothing else. There is no
 * thumbnail, no preview control and no download: no customer operation serves
 * evidence bytes, and `previewEligible` exists on the Admin contract alone. A
 * preview button here would be a control with nothing behind it.
 *
 * There is likewise no delete, no replace and no reorder. The set is append-only
 * by contract, so the list has no per-row action at all — which is the honest
 * rendering of "you cannot take this back", rather than a disabled bin icon that
 * invites the customer to wonder why.
 *
 * ## The status is the image's, and it is said in the image's words
 *
 * `UPLOADED` and `INSPECTING` share one label because the customer-visible
 * difference is nil. `ACCEPTED` says the workshop can see the picture, not that
 * the money arrived. `REJECTED` says the file is unusable, not that the payment
 * failed. The section above carries the approved warning that spells this out;
 * the rows themselves simply never use a payment word — and never the word
 * *cọc*, even though the route these rows came from is deposit-named.
 */
interface EvidenceListProps {
  readonly items: readonly TransferEvidenceItemResponse[];
}

const TONES: Readonly<Record<ReturnType<typeof evidenceToneOf>, PillTone>> = {
  PENDING: 'PROGRESS',
  ACCEPTED: 'SUCCESS',
  REJECTED: 'DANGER',
};

export function EvidenceList({ items }: EvidenceListProps) {
  if (items.length === 0) {
    return <p className="secure-final-payment__fine-print">{COPY.evidence.empty}</p>;
  }

  return (
    <ul className="secure-final-payment__evidence-list" aria-label={COPY.evidence.listLabel}>
      {items.map((item) => {
        const status = COPY.evidenceStatus[item.assetStatus];
        return (
          <li className="secure-final-payment__evidence-item" key={item.evidenceId}>
            <span className="secure-final-payment__evidence-glyph" aria-hidden="true">
              ▣
            </span>
            <span className="secure-final-payment__evidence-body">
              <FinalPaymentPill
                tone={TONES[evidenceToneOf(item.assetStatus)]}
                label={status.label}
              />
              <span className="secure-final-payment__evidence-meta">
                {`${formatInstant(item.createdAt)} · ${item.mediaType} · ${formatByteSize(item.byteSize)}`}
              </span>
              <span className="secure-final-payment__evidence-note">{status.note}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
