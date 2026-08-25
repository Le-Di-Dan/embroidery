'use client';

import type { AdminProductionTransitionResponse } from '@embroidery/api-client';

import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import { toProductionHistoryRows } from '../model/production-job-history';

interface ProductionHistoryCardProps {
  readonly transitions: readonly AdminProductionTransitionResponse[];
}

/**
 * The append-only LC-18 timeline (`784:84`, `785:225`).
 *
 * Rendered in the server's insert order, one row per returned transition. There
 * is no client sort and — the assertion that matters — no synthetic
 * `(created) → PLANNED` row: creating a job is not recorded as a transition, so
 * inventing one would put a record on screen that does not exist in the
 * database (`784:96`).
 *
 * A fresh `PLANNED` job therefore renders the approved empty state, which says
 * why the history is empty rather than leaving an operator to wonder whether the
 * read failed.
 */
export function ProductionHistoryCard({ transitions }: ProductionHistoryCardProps) {
  const rows = toProductionHistoryRows(transitions);

  return (
    <section className="job-card" data-testid="production-job-history">
      <h2 className="job-card__title">{COPY.history.title}</h2>
      <p className="job-card__source">{COPY.history.source}</p>

      {rows.length === 0 ? (
        <div className="job-history-empty" data-testid="production-job-history-empty">
          <p className="job-history-empty__title">{COPY.history.emptyTitle}</p>
          <p className="job-history-empty__body">{COPY.history.emptyBody}</p>
        </div>
      ) : (
        <table className="job-history">
          <caption className="job-history__caption">{COPY.history.title}</caption>
          <thead>
            <tr>
              <th scope="col">{COPY.history.columnTransition}</th>
              <th scope="col">{COPY.history.columnActor}</th>
              <th scope="col">{COPY.history.columnAt}</th>
              <th scope="col">{COPY.history.columnReason}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-testid="production-job-history-row">
                <th scope="row" className="job-history__move" title={row.moveLabel}>
                  {row.move}
                </th>
                <td className="job-history__actor">{row.actor}</td>
                <td className="job-history__at">
                  <time dateTime={row.at}>{row.atLabel}</time>
                </td>
                <td className="job-history__reason">{row.reason ?? COPY.history.noReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="job-card__note">{COPY.history.noCreationRow}</p>
      <p className="job-card__note">{COPY.history.actorNote}</p>
    </section>
  );
}
