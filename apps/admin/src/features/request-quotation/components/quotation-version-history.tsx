'use client';

import type {
  AdminQuotationHeaderResponse,
  AdminQuotationVersionResponse,
} from '@embroidery/api-client';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import { formatExactMoney } from '../model/exact-money';
import {
  isCustomerCurrent,
  presentInstant,
  presentVersionStatus,
} from '../model/quotation-presentation';

interface HistoryProps {
  readonly header: AdminQuotationHeaderResponse;
  readonly versions: readonly AdminQuotationVersionResponse[];
  readonly selectedVersionId: string | null;
  readonly onSelect: (versionId: string) => void;
}

/**
 * The full version history (`690:3`).
 *
 * ### Every version is listed, in server order
 *
 * `APP6-B02` returns them oldest first by version number, unpaginated and
 * unfiltered, and this renders them in exactly that order without re-sorting.
 * Nothing is hidden: a `SUPERSEDED`, `REJECTED` or `EXPIRED` version stays on
 * screen as it was priced, because the reason an operator opens this list is
 * usually to explain a price that is no longer current.
 *
 * ### The totals are the recorded ones
 *
 * Each row shows the total that version stored. No amount is recalculated, and
 * no historical deposit share is replaced with today's policy.
 *
 * ### Selection is keyboard-operable
 *
 * Each row's control is a real `button`, so it is reachable by Tab and activated
 * by Enter and Space without any key handling of our own. The table scrolls
 * inside its own frame, which keeps the page free of a horizontal scrollbar
 * without trapping the keyboard.
 */
export function QuotationVersionHistory({
  header,
  versions,
  selectedVersionId,
  onSelect,
}: HistoryProps) {
  return (
    <section className="request-quotation__history" data-testid="quotation-history">
      <h2 className="request-quotation__section-heading">{COPY.sections.history}</h2>

      <div className="request-quotation__table-scroll">
        <table className="request-quotation__table">
          <caption className="request-quotation__table-caption">{COPY.sections.history}</caption>
          <thead>
            <tr>
              <th scope="col">{COPY.lines.position}</th>
              <th scope="col">{COPY.context.status}</th>
              <th scope="col">{COPY.totals.total}</th>
              <th scope="col">{COPY.version.createdAt}</th>
              <th scope="col">{COPY.version.sentAt}</th>
              <th scope="col">{COPY.version.validUntil}</th>
              <th scope="col">{COPY.version.selectLabel}</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => {
              const selected = version.versionId === selectedVersionId;
              const current = isCustomerCurrent(header, version);
              return (
                <tr
                  key={version.versionId}
                  data-testid={`quotation-history-row-${String(version.version)}`}
                  {...(selected ? { 'aria-current': 'true' as const } : {})}
                >
                  <td>{String(version.version)}</td>
                  <td>
                    <span className="request-quotation__badge" data-status={version.status}>
                      {presentVersionStatus(version.status)}
                    </span>
                    {current ? (
                      <span className="request-quotation__badge request-quotation__badge--current">
                        {COPY.version.current}
                      </span>
                    ) : null}
                  </td>
                  {/* The total as this version recorded it. Never recomputed. */}
                  <td>{formatExactMoney(version.totalAmount)}</td>
                  <td>{presentInstant(version.createdAt)}</td>
                  <td>{presentInstant(version.sentAt)}</td>
                  <td>{presentInstant(version.validUntil)}</td>
                  <td>
                    <button
                      className="request-quotation__button request-quotation__button--quiet"
                      type="button"
                      disabled={selected}
                      onClick={() => {
                        onSelect(version.versionId);
                      }}
                    >
                      {selected ? COPY.version.selected : COPY.version.selectLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
