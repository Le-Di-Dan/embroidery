/**
 * How a job's LC-18 state is named to an operator.
 *
 * ## Four values, and there is no fifth
 *
 * `AdminProductionJobListStatusItem` publishes the whole LC-18 vocabulary —
 * `PLANNED`, `STARTED`, `COMPLETED`, `CANCELLED` — and the approved dropdown
 * says so on the screen itself (`780:176`). There is deliberately no
 * `QUEUED`, `RUNNING`, `BLOCKED`, `FAILED`, `CLAIMED` or `RETRYING` here: the
 * production model has no such state, and a label for one would be this screen
 * inventing a lifecycle the server cannot report.
 *
 * ## It presents, and only presents
 *
 * There is no transition table, no action matrix and no "can this job move to
 * X". Those are server facts that `APP8-B04` decides under a row lock, and a
 * helper answering them would become a second lifecycle authority living in the
 * browser. `APP8-A02` renders no transition control at all.
 *
 * ## Feature scope, deliberately
 *
 * This lives in the production capability rather than in `src/shared`, which is
 * the narrowest valid scope today (CLAUDE.md §5): the queue is its only
 * consumer. `APP8-A03` may promote it when the job detail needs the same
 * words — that is a move with two real callers, not an abstraction created for
 * a hypothetical one.
 */
import type { AdminProductionJobListStatusItem } from '@embroidery/api-client';

import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';

export type ProductionStatusValue =
  (typeof AdminProductionJobListStatusItem)[keyof typeof AdminProductionJobListStatusItem];

export interface ProductionStatusPresentation {
  /** The stored value when this build has a label for it, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
  readonly known: boolean;
}

interface StatusStyle {
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
}

/**
 * The four states, with the tone and symbol `780:53`…`780:95` draw.
 *
 * The symbols come from the shared `753:120` vocabulary rather than a second
 * set: a waiting job and a waiting payment should not be marked differently
 * for no reason.
 */
const PRODUCTION_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  PLANNED: { label: 'Đã lên lệnh', tone: 'info', symbol: STATUS_SYMBOLS.waiting },
  STARTED: { label: 'Đang sản xuất', tone: 'warning', symbol: STATUS_SYMBOLS.running },
  COMPLETED: { label: 'Hoàn tất', tone: 'success', symbol: STATUS_SYMBOLS.succeeded },
  CANCELLED: { label: 'Đã huỷ', tone: 'error', symbol: STATUS_SYMBOLS.ended },
};

/** The neutral fallback, for a state this build has no approved label for. */
export const UNKNOWN_PRODUCTION_STATUS_LABEL = 'Không xác định';

/**
 * Total by construction: accepts `unknown` and always returns a presentation.
 * A state the contract gains later degrades to the neutral fallback rather than
 * putting a raw English enum member on an otherwise Vietnamese page.
 */
export function presentProductionStatus(status: unknown): ProductionStatusPresentation {
  const style = typeof status === 'string' ? PRODUCTION_STATUS_STYLES[status] : undefined;
  if (style === undefined) {
    return {
      token: 'UNKNOWN',
      label: UNKNOWN_PRODUCTION_STATUS_LABEL,
      tone: 'neutral',
      symbol: STATUS_SYMBOLS.idle,
      known: false,
    };
  }
  return { token: status as string, ...style, known: true };
}

/** The label alone, for prose that names a state inline. */
export function productionStatusLabel(status: unknown): string {
  return presentProductionStatus(status).label;
}
