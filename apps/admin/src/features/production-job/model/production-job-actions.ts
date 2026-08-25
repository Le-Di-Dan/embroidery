/**
 * Which transition controls the approved frames draw for a job's *current*
 * state — and nothing more than that.
 *
 * ## This is presentation, not eligibility
 *
 * `784:128` and `787:181` are explicit: legality is owned by the server, which
 * re-decides it under a row lock at the moment the command arrives. A visible
 * "Bắt đầu sản xuất" means the approved PLANNED frame draws that control, not
 * that the move will succeed — the deposit may have lapsed, the order may have
 * been put on hold, the approval may have changed, a reservation may have been
 * released, all between this render and the click.
 *
 * So this function reads `job.status` and reads nothing else. It does not look
 * at `reservationSummary`, at `catalogItemCount`, at timestamps or at the
 * transition history, because any of those would be the beginning of a
 * browser-side GRD-015 — a second lifecycle authority that would disable a
 * legal command or enable an illegal one on stale information.
 *
 * ## Four states in, at most two controls out
 *
 * `PLANNED` → start, cancel (`784:123`, `784:125`).
 * `STARTED` → complete, cancel (`784:254`, `784:256`).
 * `COMPLETED` → none. APP8 has no move left on a finished job, and no
 *   remaining-payment, shipping or settlement control belongs here (`785:131`).
 * `CANCELLED` → none. A cancelled job is not restartable; a redo would be a new
 *   job APP8 does not create (`785:267`).
 *
 * An unrecognised state also yields none, which is the only safe answer: a
 * control for a lifecycle this build does not know is a command nothing can
 * predict the effect of.
 */

/** The three commands `APP8-B04` accepts, named as the operator sees them. */
export type ProductionJobAction = 'start' | 'complete' | 'cancel';

const ACTIONS_BY_STATUS: Readonly<Record<string, readonly ProductionJobAction[]>> = {
  PLANNED: ['start', 'cancel'],
  STARTED: ['complete', 'cancel'],
  COMPLETED: [],
  CANCELLED: [],
};

const NO_ACTIONS: readonly ProductionJobAction[] = [];

export function productionJobActions(status: unknown): readonly ProductionJobAction[] {
  if (typeof status !== 'string') return NO_ACTIONS;
  return ACTIONS_BY_STATUS[status] ?? NO_ACTIONS;
}

/**
 * The `to` value each control submits. Deliberately a total map over the three
 * actions: a control whose command was not spelled out here could not compile.
 */
export const TRANSITION_TARGET_OF: Readonly<
  Record<ProductionJobAction, 'STARTED' | 'COMPLETED' | 'CANCELLED'>
> = {
  start: 'STARTED',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};

/**
 * Whether the command carries a reason.
 *
 * Only cancellation does. `787:88` records that sending `reason` with `STARTED`
 * or `COMPLETED` is refused with a `400`, which is why the two confirmation
 * dialogs have no reason field at all rather than an optional one.
 */
export function requiresCancellationReason(action: ProductionJobAction): boolean {
  return action === 'cancel';
}
