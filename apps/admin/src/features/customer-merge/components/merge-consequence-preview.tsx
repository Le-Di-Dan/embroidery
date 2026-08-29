'use client';

/**
 * The consequence preview (`FIG-APP10-A02-CASE-REQUESTED-DESKTOP` `836:3`, with
 * its semantics fixed by `FIG-APP10-A02-PREVIEW-SEMANTICS` `841:84`).
 *
 * ### It is a preview, and it never stops saying so
 *
 * The counts are computed from current rows on every read, stored nowhere, and
 * advisory: rows arrive and leave between opening a case and executing it, and
 * execution re-evaluates state inside its own transaction. The intro says that
 * in place. This component is rendered **only for a REQUESTED case** — after a
 * decision the same fields describe whatever is live *now*, which for an
 * executed merge is close to nothing, and showing them beside "đã gộp" would
 * relabel a fresh reading as a record of what moved. That is the one thing
 * `841:84` forbids outright.
 *
 * ### Domain labels, never schema
 *
 * "Đơn hàng", not `orders`; "Quyền truy cập an toàn đang hoạt động", not
 * `secure_access_grants`. No table, column or constraint name appears anywhere on
 * this screen.
 *
 * ### Only what the API counts
 *
 * Six numbers and a readiness triple, because that is the whole published
 * preview. There is no per-record list, and none is invented: the API returns
 * counts, not rows, and a screen that listed "every affected order" would be
 * fabricating a read that does not exist.
 *
 * ### Frozen evidence is described as preserved
 *
 * Approval snapshots, quotation acceptances, design reviews, audit events and
 * every append-only transition history keep their original Customer. The note
 * says they are *not* rewritten, which is both the truth and the thing an
 * operator would otherwise assume the opposite of.
 */
import type { MergeConsequencePreviewResponse } from '@embroidery/api-client';

import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';

const COPY = CUSTOMER_MERGE_COPY.preview;

interface MergeConsequencePreviewProps {
  readonly preview: MergeConsequencePreviewResponse;
}

export function MergeConsequencePreview({ preview }: MergeConsequencePreviewProps) {
  const tiles: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: number;
    readonly note?: string;
  }[] = [
    { id: 'contact-points', label: COPY.contactPoints, value: preview.contactPoints },
    {
      id: 'active-grants',
      label: COPY.activeSecureAccessGrants,
      value: preview.activeSecureAccessGrants,
      note: COPY.activeSecureAccessGrantsNote,
    },
    { id: 'custom-requests', label: COPY.customRequests, value: preview.customRequests },
    { id: 'orders', label: COPY.orders, value: preview.orders },
    { id: 'uploaded-assets', label: COPY.uploadedAssets, value: preview.uploadedAssets },
  ];

  return (
    <section className="customer-merge-preview" aria-labelledby="merge-preview-heading">
      <h2 className="customer-merge__section-title" id="merge-preview-heading">
        {COPY.heading}
      </h2>
      <p className="customer-merge__note">{COPY.intro}</p>

      <ul className="customer-merge-preview__tiles" data-testid="merge-preview-tiles">
        {tiles.map((tile) => (
          <li className="customer-merge-preview__tile" key={tile.id}>
            {/* Label and count are one item, so a wrapped tile at 1280 can never
                separate a number from what it counts. */}
            <span className="customer-merge-preview__label">{tile.label}</span>
            <span
              className="customer-merge-preview__value"
              data-testid={`merge-preview-${tile.id}`}
            >
              {tile.value}
            </span>
            {tile.note === undefined ? null : (
              <span className="customer-merge-preview__note">{tile.note}</span>
            )}
          </li>
        ))}
      </ul>

      <h3 className="customer-merge-preview__subheading">{COPY.businessProfileHeading}</h3>
      <dl
        className="customer-merge-preview__readiness"
        data-testid="merge-preview-business-profile"
      >
        <div className="customer-merge-preview__readiness-row">
          <dt>{COPY.businessProfileLoserHas}</dt>
          <dd data-testid="merge-preview-loser-profile">
            {preview.businessProfile.loserHasProfile ? COPY.yes : COPY.no}
          </dd>
        </div>
        <div className="customer-merge-preview__readiness-row">
          <dt>{COPY.businessProfileSurvivorHas}</dt>
          <dd data-testid="merge-preview-survivor-profile">
            {preview.businessProfile.survivorHasProfile ? COPY.yes : COPY.no}
          </dd>
        </div>
      </dl>

      <p className="customer-merge__note" data-testid="merge-frozen-note">
        {COPY.frozenNote}
      </p>
    </section>
  );
}
