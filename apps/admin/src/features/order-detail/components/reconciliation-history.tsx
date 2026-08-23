import type { AdminPaymentReconciliationResponse } from '@embroidery/api-client';

import { formatGroupedAmount } from '../../../shared/presentation/exact-amount';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { formatInstant } from '../../../shared/presentation/instant';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { presentResolvedStatus } from '../model/payment-vocabulary';
import { LongTextValue } from './long-text-value';

interface ReconciliationHistoryProps {
  readonly reconciliations: readonly AdminPaymentReconciliationResponse[];
}

/** The summary row's column count, which the detail row below it spans. */
const HISTORY_COLUMN_COUNT = 5;

/**
 * The audit-safe reconciliation timeline (`743:35`).
 *
 * ## Built from the reconciliation array and from nothing else
 *
 * `743:37` is explicit about the exclusions, and they are exclusions of things
 * that exist elsewhere in the system: no outbox payload, no audit JSON, no
 * storage metadata, no provider event, no secure token and no step-up challenge.
 * None of them is in `APP7-B04`'s response, and nothing here reaches for one.
 *
 * ## Absent optional fields say "—", never a substitute
 *
 * `amount`, `bankReference`, `paymentAttemptId` and `resolvedStatus` are all
 * optional in the contract (`743:84`). An absent observed amount means no figure
 * was recorded — *not* that nothing arrived — so it renders as a dash rather
 * than as `0`, which would be a number the operator never wrote.
 *
 * ## The action column is verbatim
 *
 * `MANUAL_MATCH` and `RESOLVE_REVIEW` are rendered as stored. Translating an
 * audit action would put a word in the history that the audit trail does not
 * contain, and `RESOLVE_REVIEW` in particular is the standing evidence that a
 * `REQUIRES_REVIEW` attempt is resolved through the ordinary verification and
 * not through some separate endpoint.
 *
 * ## A long observed reference is truncated *here* and nowhere else
 *
 * The bank memo can be a whole sentence. In a read-only cell it is shortened
 * with a keyboard-reachable control that reveals the full value; the stored
 * value is never altered, and nothing on the submitting side truncates anything.
 */
export function ReconciliationHistory({ reconciliations }: ReconciliationHistoryProps) {
  return (
    <section className="order-card" aria-labelledby="order-history-heading">
      <h2 className="order-card__title" id="order-history-heading">
        {COPY.sections.history}
      </h2>
      <p className="order-card__help">{COPY.sections.historyHelp}</p>

      {reconciliations.length === 0 ? (
        <p className="order-card__note" data-testid="order-history-empty">
          {COPY.history.empty}
        </p>
      ) : (
        <table className="order-history" data-testid="order-history-table">
          <caption className="order-history__caption">{COPY.sections.history}</caption>
          <thead>
            <tr>
              <th scope="col">{COPY.history.at}</th>
              <th scope="col">{COPY.history.action}</th>
              <th scope="col">{COPY.history.result}</th>
              <th scope="col" className="order-history__numeric">
                {COPY.history.amount}
              </th>
              <th scope="col">{COPY.history.admin}</th>
            </tr>
          </thead>
          {/* One `tbody` per entry, so the detail line is a real row beneath its
              own summary row rather than an extra cell that would put the
              columns out of step. */}
          {reconciliations.map((entry) => {
            const resolved =
              entry.resolvedStatus === undefined
                ? null
                : presentResolvedStatus(entry.resolvedStatus);
            return (
              <tbody key={entry.reconciliationId}>
                <tr data-testid="order-history-row">
                  <td>
                    <time dateTime={entry.createdAt}>{formatInstant(entry.createdAt)}</time>
                  </td>
                  <th scope="row" className="order-history__action">
                    {entry.action}
                  </th>
                  <td>
                    {resolved === null ? (
                      <span className="order-history__absent">{COPY.history.absent}</span>
                    ) : (
                      <AdminStatusBadge
                        token={resolved.token}
                        label={resolved.token}
                        tone={resolved.tone}
                        symbol={resolved.symbol}
                        testId="history-resolved-status"
                      />
                    )}
                  </td>
                  <td className="order-history__numeric" data-testid="history-amount">
                    {entry.amount === undefined ? (
                      <span className="order-history__absent">{COPY.history.absent}</span>
                    ) : (
                      formatGroupedAmount(entry.amount)
                    )}
                  </td>
                  <td className="order-history__admin" title={entry.adminId}>
                    {truncateIdentifier(entry.adminId)}
                  </td>
                </tr>
                <tr className="order-history__detail-row">
                  <td className="order-history__detail" colSpan={HISTORY_COLUMN_COUNT}>
                    <span className="order-history__reason">
                      {`${COPY.history.reason}: `}
                      {entry.reason}
                    </span>
                    <span className="order-history__reference">
                      {`${COPY.history.bankReference}: `}
                      {entry.bankReference === undefined ? (
                        COPY.history.absent
                      ) : (
                        <LongTextValue
                          value={entry.bankReference}
                          label={COPY.history.bankReference}
                          testId="history-bank-reference"
                        />
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
            );
          })}
        </table>
      )}
    </section>
  );
}
