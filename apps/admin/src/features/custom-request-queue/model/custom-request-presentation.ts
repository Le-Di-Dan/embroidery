/**
 * How a stored lifecycle state and a subject branch become operator-facing text.
 *
 * `APP5-B04` publishes the **full** LC-11 enum on this surface, not just the
 * three triage states, because a specifically filtered `QUOTED` request is
 * reported truthfully rather than folded into an APP5 state it is not. So the
 * label table covers all ten, and an unmapped value degrades to a neutral label
 * instead of putting a raw server token in front of an operator.
 *
 * A label is never colour alone (`CLAUDE.md` accessibility, approved handoff
 * "màu không phải tín hiệu duy nhất"): the badge always renders text, and the
 * tint is a redundant cue the stylesheet adds.
 *
 * Nothing here confers an action. `APP5-A01` is read-only: an APP6 state such as
 * `DIGITIZING` gets a name and nothing else.
 */
import {
  AdminCustomRequestQueueItemResponseStatus,
  AdminCustomRequestQueueItemResponseSubjectKind,
} from '@embroidery/api-client';

import { CUSTOM_REQUEST_QUEUE_COPY } from './custom-request-queue-copy';

const S = AdminCustomRequestQueueItemResponseStatus;
const K = AdminCustomRequestQueueItemResponseSubjectKind;

/** The three states `APP5` owns a transition into or out of, in triage order. */
export const TRIAGE_STATUSES = [S.NEW, S.UNDER_REVIEW, S.NEEDS_CLARIFICATION] as const;

/** Every canonical state, triage first, then the APP6+ states, then the ends. */
export const QUEUE_STATUS_ORDER = [
  S.NEW,
  S.UNDER_REVIEW,
  S.NEEDS_CLARIFICATION,
  S.QUOTED,
  S.QUOTE_ACCEPTED,
  S.DIGITIZING,
  S.DESIGN_REVIEW,
  S.APPROVED,
  S.REJECTED,
  S.CANCELLED,
] as const;

const STATUS_LABELS: Readonly<Record<string, string>> = {
  [S.NEW]: CUSTOM_REQUEST_QUEUE_COPY.status.new,
  [S.UNDER_REVIEW]: CUSTOM_REQUEST_QUEUE_COPY.status.underReview,
  [S.NEEDS_CLARIFICATION]: CUSTOM_REQUEST_QUEUE_COPY.status.needsClarification,
  [S.QUOTED]: CUSTOM_REQUEST_QUEUE_COPY.status.quoted,
  [S.QUOTE_ACCEPTED]: CUSTOM_REQUEST_QUEUE_COPY.status.quoteAccepted,
  [S.DIGITIZING]: CUSTOM_REQUEST_QUEUE_COPY.status.digitizing,
  [S.DESIGN_REVIEW]: CUSTOM_REQUEST_QUEUE_COPY.status.designReview,
  [S.APPROVED]: CUSTOM_REQUEST_QUEUE_COPY.status.approved,
  [S.REJECTED]: CUSTOM_REQUEST_QUEUE_COPY.status.rejected,
  [S.CANCELLED]: CUSTOM_REQUEST_QUEUE_COPY.status.cancelled,
};

export interface StatusPresentation {
  /** The stored value when it is one the contract defines, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly known: boolean;
}

/** Total: every input produces a presentation, and none echoes a raw token. */
export function presentStatus(status: unknown): StatusPresentation {
  const label = typeof status === 'string' ? STATUS_LABELS[status] : undefined;
  return label === undefined
    ? { token: 'UNKNOWN', label: CUSTOM_REQUEST_QUEUE_COPY.status.unknown, known: false }
    : { token: status as string, label, known: true };
}

const SUBJECT_LABELS: Readonly<Record<string, string>> = {
  [K.CATALOG]: CUSTOM_REQUEST_QUEUE_COPY.subject.catalog,
  [K.CUSTOMER_OWNED]: CUSTOM_REQUEST_QUEUE_COPY.subject.customerOwned,
};

/** The XOR branch as a label. An unknown branch is named, never guessed at. */
export function subjectKindLabel(kind: unknown): string {
  const label = typeof kind === 'string' ? SUBJECT_LABELS[kind] : undefined;
  return label ?? CUSTOM_REQUEST_QUEUE_COPY.subject.unknown;
}

/**
 * The effective triage scope, as the *server* stated it in `appliedStatuses`.
 *
 * Derived from the response and never from the local filter value: with no
 * explicit filter the server applies the triage set, and a screen that printed
 * its own idea of the default would eventually disagree with what it is showing.
 */
export function appliedScopeLabels(applied: readonly string[]): readonly string[] {
  return applied.map((status) => presentStatus(status).label);
}
