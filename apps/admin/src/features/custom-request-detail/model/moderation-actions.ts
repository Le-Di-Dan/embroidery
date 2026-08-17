/**
 * Which moderation actions the screen *offers* in a given status (`APP5-A02`
 * §11; `FIG-APP5-A02-ACTION-MATRIX`, `667:56`).
 *
 * ### Presentation only
 *
 * `APP5-B05` is the lifecycle authority and re-reads the source state under a
 * row lock before it decides anything. This table exists so an operator is not
 * offered a button that is certain to be refused — it is not a second policy,
 * and nothing here is trusted by the server. The screen therefore never sends
 * the state it believed the request was in: `expectedFrom` is server-side, and
 * the payload carries only the target and its justification.
 *
 * ### Narrower than the lifecycle, never wider
 *
 * The table mirrors `APP5_TRANSITIONS` restricted to the three states APP5 owns
 * a move from. Every other canonical status — the five APP6 ones and the two
 * terminal ones — maps to an empty list, so `QUOTED` and `REJECTED` are refused
 * by the same lookup that permits a triage move rather than by a special case
 * somebody could forget. There is no APP6 action anywhere in this module: this
 * phase owns no transition into `QUOTED`, and a disabled button hinting at one
 * would be an unreleased surface leaking through a tooltip.
 *
 * An unmapped status resolves to no actions at all. Failing closed is the only
 * safe direction: offering a moderation action on a state the client does not
 * recognise is how a request in an APP6 state acquires an APP5 button.
 */
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from './custom-request-detail-copy';

/** The four targets `APP5-B05` accepts. `NEW` is not among them (`G01-D05`). */
export type ModerationTarget = 'UNDER_REVIEW' | 'NEEDS_CLARIFICATION' | 'REJECTED' | 'CANCELLED';

/**
 * Which approved surface collects the justification for a target.
 *
 * `direct` is not a missing dialog. Both `UNDER_REVIEW` moves forbid a
 * customer-visible reason and require nothing else (`APP5-B05` policy), and
 * `APP5-D01` approved no dialog frame for them — only `669:3`, `669:60` and
 * `669:119`, for clarification, rejection and cancellation. So the review move
 * is one deliberate click that sends only its target, and the screen invents no
 * form for optional fields no approved frame offers.
 */
export type ModerationSurface = 'direct' | 'clarify' | 'reject' | 'cancel';

export interface ModerationAction {
  readonly target: ModerationTarget;
  readonly label: string;
  readonly surface: ModerationSurface;
  /** Stable hook for tests and for the visual-review harness. */
  readonly testId: string;
}

const START_REVIEW: ModerationAction = {
  target: 'UNDER_REVIEW',
  label: COPY.actions.startReview,
  surface: 'direct',
  testId: 'moderation-action-start-review',
};

// The same transition as `START_REVIEW`, worded for the state it is offered
// from: coming back from a clarification is resuming a review, not starting one.
const RESUME_REVIEW: ModerationAction = {
  ...START_REVIEW,
  label: COPY.actions.resumeReview,
  testId: 'moderation-action-resume-review',
};

const NEEDS_CLARIFICATION: ModerationAction = {
  target: 'NEEDS_CLARIFICATION',
  label: COPY.actions.needsClarification,
  surface: 'clarify',
  testId: 'moderation-action-clarify',
};

const REJECT: ModerationAction = {
  target: 'REJECTED',
  label: COPY.actions.reject,
  surface: 'reject',
  testId: 'moderation-action-reject',
};

const CANCEL: ModerationAction = {
  target: 'CANCELLED',
  label: COPY.actions.cancel,
  surface: 'cancel',
  testId: 'moderation-action-cancel',
};

const NO_ACTIONS: readonly ModerationAction[] = [];

const ACTIONS_BY_STATUS: Readonly<Record<string, readonly ModerationAction[]>> = {
  NEW: [START_REVIEW, CANCEL],
  UNDER_REVIEW: [NEEDS_CLARIFICATION, REJECT, CANCEL],
  NEEDS_CLARIFICATION: [RESUME_REVIEW, REJECT, CANCEL],
  // Cancellation is bounded to stage S1 (`G01-D06`), so it disappears the moment
  // a request has been quoted — it is absent from every entry below, not
  // disabled in them.
  QUOTED: NO_ACTIONS,
  QUOTE_ACCEPTED: NO_ACTIONS,
  DIGITIZING: NO_ACTIONS,
  DESIGN_REVIEW: NO_ACTIONS,
  APPROVED: NO_ACTIONS,
  REJECTED: NO_ACTIONS,
  CANCELLED: NO_ACTIONS,
};

/** The actions offered from a status. Unknown input yields none. */
export function moderationActionsFor(status: unknown): readonly ModerationAction[] {
  if (typeof status !== 'string') return NO_ACTIONS;
  return ACTIONS_BY_STATUS[status] ?? NO_ACTIONS;
}
