/**
 * The reservation summary, read exactly as the server sent it.
 *
 * ## Display context, never the start gate
 *
 * `AdminProductionReservationSummaryResponse` says so in the contract itself and
 * `788:3` fixes it as product truth: this summary is taken **without** the stock
 * row lock, and `APP8-B04` decides a start by re-reading under that lock. So
 * nothing in this module answers "can production start" — there is no
 * `hasEnoughStock`, no shortfall arithmetic and no boolean any control consumes.
 * A helper like that would be a browser-side GRD-015 built on a figure that was
 * already stale when it arrived.
 *
 * ## Catalog, COP-only and mixed are three different truths
 *
 * `788:3` fixes each one:
 *
 * - **catalog** — every line names a Catalog SKU; the real reservation rows are
 *   shown as returned, terminal ones included.
 * - **customerOwned** — `required = false`. The *absence* of a reservation is
 *   the correct, valid state (PO-APP8-001): a neutral surface, no warning
 *   colour, no "missing" wording and, above all, no fabricated SKU or row.
 * - **mixed** — the Catalog rows only, plus copy stating that the COP portion
 *   has none and never will. A placeholder COP row would be an invented record.
 *
 * A terminal row is still rendered rather than filtered out, because
 * "reserved then released" and "never reserved" are different facts and only the
 * row distinguishes them (`785:260`).
 */
import type {
  AdminProductionReservationResponse,
  AdminProductionReservationSummaryResponse,
} from '@embroidery/api-client';

import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';
import { PRODUCTION_JOB_COPY as COPY } from './production-job-copy';

/** Which of the three approved reservation truths this order is. */
export type ReservationMode = 'catalog' | 'customerOwned' | 'mixed';

export interface ReservationStatusPresentation {
  /** The stored contract value, or `UNKNOWN` when this build has no label. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly known: boolean;
}

export interface ReservationRowView {
  readonly reservationId: string;
  readonly skuId: string;
  readonly skuStockId: string;
  readonly quantity: number;
  readonly status: ReservationStatusPresentation;
}

export interface ReservationView {
  readonly mode: ReservationMode;
  readonly required: boolean;
  readonly catalogItemCount: number;
  readonly customerOwnedItemCount: number;
  readonly rows: readonly ReservationRowView[];
}

/**
 * The four stored reservation states, toned as the approved frames draw them.
 *
 * `RESERVED` is success (`784:116`), `CONSUMED` is info (`784:244`, `785:123`)
 * and `RELEASED` is neutral (`785:259`). `EXPIRED` is drawn on no frame — it is
 * the other terminal, non-consumed state, so it reuses the terminal treatment
 * rather than being given a colour no approved design assigns. Colour is never
 * the message anyway: every row carries the label.
 */
const RESERVATION_TONES: Readonly<Record<string, AdminStatusTone>> = {
  RESERVED: 'success',
  CONSUMED: 'info',
  RELEASED: 'neutral',
  EXPIRED: 'neutral',
};

const RESERVATION_LABELS: Readonly<Record<string, string>> = COPY.reservationStatus;

export function presentReservationStatus(status: unknown): ReservationStatusPresentation {
  const token = typeof status === 'string' ? status : '';
  const label = RESERVATION_LABELS[token];
  if (label === undefined) {
    return {
      token: 'UNKNOWN',
      label: COPY.reservationStatus.unknown,
      tone: 'neutral',
      known: false,
    };
  }
  return { token, label, tone: RESERVATION_TONES[token] ?? 'neutral', known: true };
}

function toRow(reservation: AdminProductionReservationResponse): ReservationRowView {
  return {
    reservationId: reservation.reservationId,
    skuId: reservation.skuId,
    skuStockId: reservation.skuStockId,
    quantity: reservation.quantity,
    status: presentReservationStatus(reservation.status),
  };
}

/**
 * Which truth this is, decided from the counts the server published.
 *
 * `required` alone is not enough: it answers "is there a Catalog line at all",
 * and a mixed order and a Catalog-only order both answer yes. The COP count is
 * what separates them, and it comes from the same read.
 */
export function toReservationView(
  summary: AdminProductionReservationSummaryResponse,
): ReservationView {
  const { required, catalogItemCount, customerOwnedItemCount, reservations } = summary;
  const mode: ReservationMode = !required
    ? 'customerOwned'
    : customerOwnedItemCount > 0
      ? 'mixed'
      : 'catalog';

  return {
    mode,
    required,
    catalogItemCount,
    customerOwnedItemCount,
    // Server order, one row per returned reservation. Nothing is filtered:
    // a terminal reservation is evidence that a hold existed and ended.
    rows: reservations.map(toRow),
  };
}
