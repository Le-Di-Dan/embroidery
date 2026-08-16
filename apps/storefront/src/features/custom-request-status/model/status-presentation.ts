/**
 * Lifecycle state → what the approved frames draw for it (`APP5-S02` §12, §13).
 *
 * One total function over the published enum, so there is exactly one place
 * that decides what a state looks like and no component branches on a string.
 *
 * ### Why the default is a state and not a crash
 *
 * `APP5-B03` publishes the whole LC-11 enum, and `661:*` were drawn for the
 * five intake states only. The five APP6+ states — `QUOTED`, `QUOTE_ACCEPTED`,
 * `DIGITIZING`, `DESIGN_REVIEW`, `APPROVED` — are therefore *reachable and
 * undrawn*: a request quoted the day after APP6 ships still opens this page.
 * They map to `beyondIntake`, which is truthful (the request has moved past
 * intake), neutral (it claims no quotation, approval, payment or order) and
 * action-free (§14 forbids every control APP6 will eventually add). It is
 * forward-compatible *read* behaviour and nothing more.
 *
 * The switch is exhaustive over the enum rather than a lookup keyed by it, so
 * the day a new LC-11 member is published TypeScript points at this file.
 */
import { CustomRequestStatusResponseStatus } from '@embroidery/api-client';

import { CUSTOM_REQUEST_STATUS_COPY as COPY } from './custom-request-status-copy';

/**
 * How a state is coloured. Never the only carrier of meaning — every badge
 * prints its own label and every card repeats it in prose (`634:150`).
 */
export type StatusTone = 'INFO' | 'WARNING' | 'ERROR' | 'NEUTRAL';

/** One dot on the three-step progress rail (`661:15` … `661:25`). */
export type ProgressMark = 'DONE' | 'CLOSED' | 'PENDING';

export interface StatusPresentation {
  readonly badge: string;
  readonly description: string;
  readonly nextSteps: readonly string[];
  readonly tone: StatusTone;
  /** Present only where the workshop owes the customer a message (§12). */
  readonly reasonTitle?: string;
  readonly progress: {
    readonly submitted: ProgressMark;
    readonly underReview: ProgressMark;
    readonly answered: ProgressMark;
  };
}

const { states, reason } = COPY;

export function presentationOf(status: string): StatusPresentation {
  switch (status) {
    case CustomRequestStatusResponseStatus.NEW:
      return {
        ...states.new,
        tone: 'INFO',
        progress: { submitted: 'DONE', underReview: 'PENDING', answered: 'PENDING' },
      };
    case CustomRequestStatusResponseStatus.UNDER_REVIEW:
      return {
        ...states.underReview,
        tone: 'WARNING',
        progress: { submitted: 'DONE', underReview: 'DONE', answered: 'PENDING' },
      };
    case CustomRequestStatusResponseStatus.NEEDS_CLARIFICATION:
      return {
        ...states.needsClarification,
        tone: 'WARNING',
        reasonTitle: reason.titles.needsClarification,
        // The third dot stays pending: the workshop has asked a question, which
        // is not the same as having answered (`661:151` is still the numeral).
        progress: { submitted: 'DONE', underReview: 'DONE', answered: 'PENDING' },
      };
    case CustomRequestStatusResponseStatus.REJECTED:
      return {
        ...states.rejected,
        tone: 'ERROR',
        reasonTitle: reason.titles.rejected,
        progress: { submitted: 'DONE', underReview: 'DONE', answered: 'CLOSED' },
      };
    case CustomRequestStatusResponseStatus.CANCELLED:
      return {
        ...states.cancelled,
        tone: 'ERROR',
        reasonTitle: reason.titles.cancelled,
        progress: { submitted: 'DONE', underReview: 'DONE', answered: 'CLOSED' },
      };
    default:
      // Every APP6+ state, and any member added after this file was written.
      // No `reasonTitle`: `customerVisibleReason` belongs to the three intake
      // outcomes, and a later phase's message is not this page's to interpret.
      return {
        ...states.beyondIntake,
        tone: 'NEUTRAL',
        progress: { submitted: 'DONE', underReview: 'DONE', answered: 'DONE' },
      };
  }
}
