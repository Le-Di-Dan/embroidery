import type { AdminCustomRequestDetailResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { presentStatus } from '../model/request-detail-presentation';

interface RequestDetailSummaryProps {
  readonly detail: AdminCustomRequestDetailResponse;
}

/**
 * The current state of one request, and the two texts that explain it
 * (`665:3`, `665:115`).
 *
 * ### The status is text before it is a colour
 *
 * The badge always renders its label; the tint the stylesheet adds is a
 * redundant cue. An operator who cannot distinguish the badge colours still
 * reads "Cần làm rõ", and an unmapped state degrades to a neutral label rather
 * than putting a raw server token on screen.
 *
 * ### `internalReason` and `customerVisibleReason` are never merged
 *
 * `APP5-B04` publishes them as two fields and they stay two fields here, each
 * under a label saying who reads it. The customer-visible one is the exact text
 * `APP5-B03` shows on the customer's own status page — so an operator has to be
 * able to see, without opening anything, precisely what the customer was told
 * and how that differs from the internal record. Neither is ever backfilled from
 * the other: a status that carries only an internal reason shows "Không có" for
 * the customer-facing half rather than repeating the staff-only text there.
 *
 * The customer's own note is shown apart from both. It is what *they* wrote at
 * submission, not an explanation of a decision anybody took.
 */
export function RequestDetailSummary({ detail }: RequestDetailSummaryProps) {
  const status = presentStatus(detail.status);
  const modifier = status.known ? status.token.toLowerCase().replace(/_/g, '-') : 'unknown';

  return (
    <section className="request-detail__panel" aria-labelledby="request-summary-heading">
      <h2 className="request-detail__panel-title" id="request-summary-heading">
        {COPY.status.label}
      </h2>

      <p
        className={`custom-request-status custom-request-status--${modifier}`}
        data-status={status.token}
        data-testid="request-detail-status"
      >
        {status.label}
      </p>

      <h3 className="request-detail__subheading">{COPY.reason.currentHeading}</h3>
      <dl className="request-detail__definitions" data-testid="request-current-reasons">
        <div className="request-detail__row">
          <dt className="request-detail__term">{COPY.reason.internal}</dt>
          <dd className="request-detail__value" data-testid="request-internal-reason">
            {detail.internalReason ?? COPY.reason.none}
          </dd>
        </div>
        <div className="request-detail__row">
          <dt className="request-detail__term">{COPY.reason.customerVisible}</dt>
          <dd className="request-detail__value" data-testid="request-customer-reason">
            {detail.customerVisibleReason ?? COPY.reason.none}
          </dd>
        </div>
      </dl>

      <h3 className="request-detail__subheading">{COPY.request.customerNote}</h3>
      <p className="request-detail__value" data-testid="request-customer-note">
        {detail.customerNote ?? COPY.request.noCustomerNote}
      </p>
    </section>
  );
}
