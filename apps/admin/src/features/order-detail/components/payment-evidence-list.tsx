'use client';

import { useState } from 'react';

import type { AdminPaymentEvidenceResponse } from '@embroidery/api-client';

import { formatInstant } from '../../../shared/presentation/instant';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { presentEvidenceStatus } from '../model/payment-vocabulary';
import { EvidencePreviewDialog } from './evidence-preview-dialog';

interface PaymentEvidenceListProps {
  readonly orderId: string;
  readonly evidence: readonly AdminPaymentEvidenceResponse[];
  /** Re-reads the payment metadata when a preview proves `previewEligible` stale. */
  readonly onMetadataStale: () => void;
}

/** Bytes per binary kilobyte and megabyte — display units, not business values. */
const KIB = 1024;
const MIB = KIB * KIB;

/** `2,4 MB` / `640 KB`, as `736:181` renders a size. */
function formatByteSize(bytes: number): string {
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(1).replace('.', ',')} MB`;
  }
  return `${String(Math.round(bytes / KIB))} KB`;
}

/**
 * The customer's transfer screenshots (`734:148`, `736:149`, `743:3`).
 *
 * ## Supporting material, never payment truth
 *
 * `751:3` forbids reading a payment state out of an image state, and this list
 * is where that would be easiest to get wrong. An `ACCEPTED` screenshot means
 * the file passed inspection — nothing about money. A `REJECTED` one means the
 * file failed inspection, and it is **not** a payment failure: the rejected
 * entry stays in the list, says so, and does not disable or discourage
 * verification anywhere. The zero-evidence state says the same thing positively:
 * a deposit with no screenshots is ordinary and verifiable.
 *
 * ## Only `ACCEPTED` can be opened, and only by `evidenceId`
 *
 * The preview control is enabled exactly when `previewEligible` is true — which
 * the contract defines as `assetStatus === ACCEPTED` — and it addresses
 * `APP7-B06` by the association id. `UPLOADED` and `INSPECTING` render
 * identically with the button disabled and labelled "Đang kiểm tra" (`743:34`);
 * `REJECTED` renders it disabled and labelled "Không xem được". No `assetId`
 * appears in this component, in the response it renders, or in any URL it builds
 * — because it builds none: there is no storage address, download link or token
 * anywhere on this path.
 *
 * ## One dialog, one image at a time
 *
 * Opening a second image replaces the first, which is what makes the object-URL
 * lifetime tractable: the dialog owns exactly one, and closing it destroys that
 * one. Navigation moves only between eligible images, so the sequence can never
 * land on something the server would refuse.
 */
export function PaymentEvidenceList({
  orderId,
  evidence,
  onMetadataStale,
}: PaymentEvidenceListProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const eligible = evidence.filter((item) => item.previewEligible);

  if (evidence.length === 0) {
    return (
      <section className="order-card" aria-labelledby="order-evidence-heading">
        <h2 className="order-card__title" id="order-evidence-heading">
          {COPY.sections.evidence}
        </h2>
        <p className="order-card__help">{COPY.sections.evidenceHelp}</p>
        <div className="order-evidence__empty" data-testid="order-evidence-empty">
          <p className="order-evidence__empty-title">{COPY.evidence.empty}</p>
          <p className="order-evidence__empty-body">{COPY.evidence.emptyBody}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="order-card" aria-labelledby="order-evidence-heading">
      <h2 className="order-card__title" id="order-evidence-heading">
        {COPY.sections.evidence}
      </h2>
      <p className="order-card__help">{COPY.sections.evidenceHelp}</p>

      <div className="order-evidence__header">
        <span className="order-evidence__count" data-testid="order-evidence-count">
          {COPY.evidence.countLabel(evidence.length)}
        </span>
        <span className="order-evidence__readonly">{COPY.evidence.readOnly}</span>
      </div>

      <ul className="order-evidence__list" data-testid="order-evidence-list">
        {evidence.map((item) => {
          const status = presentEvidenceStatus(item.assetStatus);
          const eligibleIndex = eligible.findIndex(
            (candidate) => candidate.evidenceId === item.evidenceId,
          );
          return (
            <li
              className="order-evidence__item"
              key={item.evidenceId}
              data-testid="order-evidence-item"
            >
              <div className="order-evidence__meta">
                <AdminStatusBadge
                  token={status.token}
                  label={status.label}
                  tone={status.tone}
                  symbol={status.symbol}
                  testId="evidence-status"
                />
                <span className="order-evidence__token">{item.assetStatus}</span>
              </div>
              <p className="order-evidence__facts">
                <time dateTime={item.createdAt}>{formatInstant(item.createdAt)}</time>
                {` · ${item.mediaType} · ${formatByteSize(item.byteSize)}`}
              </p>
              <button
                type="button"
                className="order-evidence__preview"
                disabled={!item.previewEligible}
                data-testid={`evidence-preview-${item.evidenceId}`}
                onClick={() => setOpenIndex(eligibleIndex)}
              >
                {item.previewEligible
                  ? COPY.evidence.preview
                  : item.assetStatus === 'REJECTED'
                    ? COPY.evidence.previewBlocked
                    : COPY.evidence.previewChecking}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="order-card__note">{COPY.evidence.authorityNote}</p>
      <p className="order-card__note">{COPY.evidence.rejectedNote}</p>

      {openIndex === null || eligible[openIndex] === undefined ? null : (
        <EvidencePreviewDialog
          orderId={orderId}
          eligible={eligible}
          index={openIndex}
          onNavigate={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onMetadataStale={onMetadataStale}
        />
      )}
    </section>
  );
}
