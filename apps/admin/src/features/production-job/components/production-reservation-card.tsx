'use client';

import type { AdminProductionReservationSummaryResponse } from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import { toReservationView, type ReservationRowView } from '../model/production-job-reservation';

interface ProductionReservationCardProps {
  readonly summary: AdminProductionReservationSummaryResponse | undefined;
}

/**
 * The read-only reservation context (`784:99`, `784:227`, `785:242`, `785:363`).
 *
 * ## Display only, and it says so on the card
 *
 * The "không phải cổng chặn" note is rendered in every mode that has rows,
 * because this summary is taken without the stock row lock and `APP8-B04`
 * decides a start by re-reading under it. No control on this screen is enabled,
 * disabled, hidden or shown by anything in here.
 *
 * ## The three truths, drawn as the matrix fixes them
 *
 * A **COP-only** order (`required = false`) renders the neutral no-reservation
 * state — no error tone, no warning glyph, no "missing" wording and no invented
 * SKU or row. A **mixed** order renders its real Catalog rows plus the note that
 * the COP portion has none and never will. A **Catalog** order renders its rows.
 * A terminal row is kept rather than filtered, so "held then released" stays
 * distinguishable from "never held".
 *
 * ## The SKU code the frames draw is not published
 *
 * `AdminProductionReservationResponse` carries `skuId` and `skuStockId` and no
 * `skuCode`, so the rows are labelled by shortened id with the full value in
 * `title`. Nothing is fetched from the catalog to resolve a code: that would be
 * the per-row enrichment `788:179` refuses, and it would put a live catalog
 * string beside a frozen specification. `FU-APP8-A01-01` already tracks the gap.
 */
export function ProductionReservationCard({ summary }: ProductionReservationCardProps) {
  if (summary === undefined) {
    return (
      <section className="job-card" data-testid="production-job-reservation">
        <h2 className="job-card__title">{COPY.reservation.title}</h2>
        <p className="job-card__body">{COPY.reservation.missingTitle}</p>
        <p className="job-card__note">{COPY.reservation.missingBody}</p>
      </section>
    );
  }

  const view = toReservationView(summary);
  const copOnly = view.mode === 'customerOwned';

  return (
    <section className="job-card" data-testid="production-job-reservation">
      <h2 className="job-card__title">
        {copOnly ? COPY.reservation.copTitle : COPY.reservation.title}
      </h2>
      <p className="job-card__source">{COPY.reservation.source}</p>

      {copOnly ? (
        <div className="job-cop" data-testid="production-job-no-reservation">
          <p className="job-cop__title">{COPY.reservation.copTitle}</p>
          <p className="job-cop__body">{COPY.reservation.copBody}</p>
        </div>
      ) : null}

      <dl className="job-counts">
        <div className="job-counts__cell">
          <dt className="job-counts__label">{COPY.reservation.catalogItems}</dt>
          <dd className="job-counts__value" data-testid="production-job-catalog-count">
            {view.catalogItemCount}
          </dd>
        </div>
        <div className="job-counts__cell">
          <dt className="job-counts__label">{COPY.reservation.customerOwnedItems}</dt>
          <dd className="job-counts__value" data-testid="production-job-cop-count">
            {view.customerOwnedItemCount}
          </dd>
        </div>
      </dl>

      {copOnly ? (
        <p className="job-card__note">{COPY.reservation.copNote}</p>
      ) : view.rows.length === 0 ? (
        <div className="job-cop" data-testid="production-job-no-reservation-rows">
          <p className="job-cop__title">{COPY.reservation.noneYetTitle}</p>
          <p className="job-cop__body">{COPY.reservation.noneYetBody}</p>
        </div>
      ) : (
        <ul className="job-reservations" data-testid="production-job-reservation-rows">
          {view.rows.map((row) => (
            <ReservationRow key={row.reservationId} row={row} />
          ))}
        </ul>
      )}

      {view.mode === 'mixed' ? (
        <div className="job-mixed" data-testid="production-job-mixed-note">
          <p className="job-mixed__title">{COPY.reservation.mixedTitle}</p>
          <p className="job-mixed__body">{COPY.reservation.mixedBody}</p>
        </div>
      ) : null}

      {!copOnly && view.rows.some((row) => row.status.token === 'CONSUMED') ? (
        <p className="job-card__note">{COPY.reservation.consumedNote}</p>
      ) : null}

      {!copOnly &&
      view.rows.some((row) => row.status.token === 'RELEASED' || row.status.token === 'EXPIRED') ? (
        <p className="job-card__note">{COPY.reservation.terminalNote}</p>
      ) : null}

      {copOnly ? null : (
        <p className="job-not-gate" data-testid="production-job-not-gate">
          <span className="job-not-gate__mark" aria-hidden="true">
            ⓘ
          </span>
          <span className="job-not-gate__body">{COPY.reservation.notGate}</span>
        </p>
      )}
    </section>
  );
}

function ReservationRow({ row }: { readonly row: ReservationRowView }) {
  return (
    <li className="job-reservation" data-status={row.status.token}>
      <span className="job-reservation__ident">
        <span className="job-reservation__sku" title={row.skuId}>
          {`${COPY.reservation.skuLabel} ${truncateIdentifier(row.skuId)}`}
        </span>
        <span className="job-reservation__stock" title={row.skuStockId}>
          {`${COPY.reservation.stockLabel} ${truncateIdentifier(row.skuStockId)}`}
        </span>
      </span>
      <span className="job-reservation__quantity">{COPY.reservation.quantity(row.quantity)}</span>
      <span className={`job-reservation__status job-reservation__status--${row.status.tone}`}>
        {row.status.label}
      </span>
    </li>
  );
}
