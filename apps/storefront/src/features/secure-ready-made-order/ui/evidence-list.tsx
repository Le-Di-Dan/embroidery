import type { TransferEvidenceItemResponse } from '@embroidery/api-client';

import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { formatByteSize, formatInstant } from '../model/order-display-format';
import { evidenceToneOf } from '../model/transfer-evidence';
import { OrderStatusPill, type PillTone } from './order-status-pill';

/**
 * The images already submitted for one attempt.
 *
 * ## Metadata only, because that is all there is
 *
 * `evidenceId`, `assetStatus`, `mediaType`, `byteSize`, `createdAt` — the five
 * fields the customer contract publishes, and nothing else. There is no
 * thumbnail, no preview control and no download: no customer operation serves
 * evidence bytes, and `previewEligible` exists on the Admin contract alone. A
 * preview button here would be a control with nothing behind it.
 *
 * There is likewise no delete, no replace and no reorder. §21 keeps the set
 * append-only, so the list has no per-row action at all — which is the honest
 * rendering of "you cannot take this back", rather than a disabled bin icon
 * that invites the customer to wonder why.
 *
 * ## The status is the image's, and it is said in the image's words (§22)
 *
 * `UPLOADED` and `INSPECTING` share one label because the customer-visible
 * difference is nil. `ACCEPTED` says the workshop can read the picture, not
 * that the money arrived — its own note says so on the row. `REJECTED` says the
 * file is unusable, not that the payment failed. The rows never use a payment
 * word, and never the word *cọc*, even though the route these rows came from is
 * deposit-named.
 *
 * ## Terminal states keep the list and lose the actions (§30)
 *
 * The caller keeps rendering this list after the payment block closes, because
 * history is worth showing. Nothing in it is interactive, so a settled or
 * cancelled order cannot present an evidence row that looks actionable.
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
    return <p className="secure-order__fine-print">{COPY.evidence.empty}</p>;
  }

  return (
    <ul className="secure-order__evidence-list" aria-label={COPY.evidence.listLabel}>
      {items.map((item) => {
        const status = COPY.evidenceStatus[item.assetStatus];
        return (
          <li className="secure-order__evidence-item" key={item.evidenceId}>
            <span className="secure-order__evidence-glyph" aria-hidden="true">
              ▣
            </span>
            <span className="secure-order__evidence-body">
              <OrderStatusPill
                tone={TONES[evidenceToneOf(item.assetStatus)]}
                label={status.label}
              />
              <span className="secure-order__evidence-meta">
                {`${formatInstant(item.createdAt)} · ${item.mediaType} · ${formatByteSize(item.byteSize)}`}
              </span>
              <span className="secure-order__evidence-note">{status.note}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
