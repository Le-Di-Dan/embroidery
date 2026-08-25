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
 * browser. In particular this module cannot be used to reconstruct GRD-015:
 * knowing a job is `PLANNED` says which *controls* the approved frames draw, and
 * says nothing at all about whether the server will accept the move behind one.
 *
 * ## Admin shared scope, on the checkpoint that gave it a second caller
 *
 * `APP8-A02` kept this inside the production-queue capability because the queue
 * was its only consumer — the narrowest valid scope at the time (CLAUDE.md §5) —
 * and recorded that `APP8-A03` should promote it once the job detail needed the
 * same words. That is now the case: the queue row, the detail status pill, the
 * transition-history rows and the dialog prose all name the same four states, so
 * this moved to Admin shared scope with two real callers rather than being
 * generalised for a hypothetical one. Nothing else moved with it — the queue's
 * filters, query keys and cursor logic stay in the queue, because the detail
 * screen has no list to filter and no cursor to carry.
 *
 * It is deliberately *not* pushed into `@embroidery/ui`: nothing on the
 * storefront renders a production state, and no customer surface exists in APP8
 * at all.
 */
import type { AdminProductionJobListStatusItem } from '@embroidery/api-client';

import type { AdminStatusTone } from '../status/admin-status-badge';
import { STATUS_SYMBOLS } from './order-status';

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
