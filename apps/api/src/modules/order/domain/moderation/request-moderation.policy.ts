/**
 * The Admin request-transition policy (`APP5-B05` §1, §2; `APP5-G01` §2,
 * `G01-D07`), widened once by `APP6-B06` for `TR-LC11-07`.
 *
 * Pure functions over a source state and a command. Nothing here reads a
 * database, so the three rules that decide whether a moderation action is legal
 * — which moves APP5 exposes, which reason texts each move requires, and which
 * note kind explains it — are decidable in a unit test without a container.
 *
 * ### This is a *restriction*, never a second lifecycle
 *
 * `isLegalRequestTransition` (`../lifecycle/request-transitions.ts`) stays the
 * canonical LC-11 graph and keeps every APP6+ edge it already carries. `G01-D07`
 * makes the APP5 subset an **application-layer** restriction layered on top of
 * it, so this table is deliberately narrower than the lifecycle and never wider:
 * a move it permits is always one the lifecycle permits too, which
 * {@link APP5_TRANSITIONS} states and the unit suite proves edge by edge.
 *
 * Deleting `QUOTED`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW` or
 * `APPROVED` from the canonical graph would be the wrong fix twice over: the
 * enum must stay complete so `APP5-B04` can read those states truthfully, and
 * APP6 owns the transitions into them.
 *
 * ### The one APP6 widening (`APP6-B06`, `TR-LC11-07`)
 *
 * `QUOTE_ACCEPTED -> DIGITIZING` is the **only** APP6 LC-11 transition an
 * operator commands. `APP6-G01` §4.1 locks the other four — `QUOTED`,
 * `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` — as projections written
 * inside the quotation or design transaction that causes them, so they stay
 * absent from {@link APP5_TRANSITION_TARGETS} and are refused at the HTTP schema
 * boundary before this file is ever consulted. Widening the target list by one
 * of those four is the specific failure `APP6-B06` exists to prevent. The
 * widening itself is one row of {@link APP5_TRANSITIONS} and one of
 * `REQUIREMENT_OF`: no source state gains any other target, and no backward
 * edge or cancellation stage comes with it.
 */
import type { CustomRequestState } from '@embroidery/database';

/**
 * The five states an Admin transition command may move a request **to**.
 *
 * `NEW` is not among them — a request exists only by being submitted
 * (`G01-D05`), and nothing moves back into it. Four of the five APP6 states are
 * absent because no operator commands them: `QUOTED`, `QUOTE_ACCEPTED`,
 * `DESIGN_REVIEW` and `APPROVED` are projections of a quotation or design
 * transaction (`APP6-G01` §4.1). `DIGITIZING` is the single exception, added by
 * `APP6-B06` for `TR-LC11-07`.
 *
 * The `APP5_` name is the delivered `APP5-B05` identifier and is kept
 * deliberately: it is imported by the published request and response schemas,
 * and renaming a frozen surface to record a phase number is not a widening.
 */
export const APP5_TRANSITION_TARGETS = [
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'REJECTED',
  'CANCELLED',
  /** `TR-LC11-07`, `APP6-B06`, under GRD-005 — see {@link APP5_TRANSITIONS}. */
  'DIGITIZING',
] as const satisfies readonly CustomRequestState[];

export type App5TransitionTarget = (typeof APP5_TRANSITION_TARGETS)[number];

/**
 * The note kinds APP5 exposes, from TBL-041's closed set.
 *
 * `PAUSE` is deliberately excluded. The column keeps it and the CHECK still
 * accepts it, but APP5 has no transition that pauses anything, so offering the
 * kind would let an operator record a decision the lifecycle cannot carry out —
 * a note whose triage meaning no screen can explain. APP6+ may adopt it.
 */
export const APP5_NOTE_KINDS = ['CLARIFY', 'REJECT', 'SPAM', 'NOTE'] as const;

export type App5NoteKind = (typeof APP5_NOTE_KINDS)[number];

/**
 * The APP5 transition subset, source state by source state.
 *
 * Every canonical state is a key, and the ones APP5 offers nothing from map to
 * an empty list — so a request that has reached `QUOTED` or a terminal state is
 * refused by the same lookup that permits a triage move, rather than by a
 * special case somebody could forget.
 */
const APP5_TRANSITIONS: Readonly<Record<CustomRequestState, readonly App5TransitionTarget[]>> = {
  NEW: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['NEEDS_CLARIFICATION', 'REJECTED', 'CANCELLED'],
  NEEDS_CLARIFICATION: ['UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  QUOTED: [],
  // `TR-LC11-07`, the one APP6 edge an operator commands. GRD-005 *is* this
  // row: `DIGITIZING` is offered from `QUOTE_ACCEPTED` and from nowhere else,
  // so there is no override to write and none to forget to check.
  QUOTE_ACCEPTED: ['DIGITIZING'],
  DIGITIZING: [],
  // `DESIGN_REVIEW -> DIGITIZING` is a legal LC-11 edge and is deliberately not
  // offered here: rework is design-version work no delivered checkpoint owns,
  // and a target list is not the place to open a workflow nothing implements.
  DESIGN_REVIEW: [],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * The states from which an accepted quotation is still ahead (GRD-005).
 *
 * A `DIGITIZING` command from one of these is not merely a move the table does
 * not list — it is the exact failure ADR-DB3-001 r1 exists to prevent — so it
 * answers with the guard's own code rather than a generic refusal. The terminal
 * and post-acceptance states are **not** here: none of them can still reach
 * `QUOTE_ACCEPTED`, so "get the quotation accepted first" would be advice that
 * operator cannot act on, and they keep the canonical `INVALID_TRANSITION`
 * (`APP6-G01` §4, error-mapping column).
 */
const PRE_ACCEPTANCE_STATES: readonly CustomRequestState[] = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
];

export function isApp5Transition(from: CustomRequestState, to: CustomRequestState): boolean {
  return (APP5_TRANSITIONS[from] as readonly CustomRequestState[]).includes(to);
}

/** What a given target requires of the operator, and what it forbids. */
interface TargetRequirement {
  readonly internalReason: 'REQUIRED' | 'OPTIONAL';
  /**
   * `FORBIDDEN` rather than `OPTIONAL` on the two `UNDER_REVIEW` moves.
   *
   * `APP5-G01` §8 maps no customer notification to either of them, so a
   * customer-visible text written there would be a message with no delivery and
   * — worse — one `APP5-B03` would then show on a status page as the
   * explanation of a state the customer was never told about. Refused rather
   * than dropped: silently discarding an operator's words is how they believe
   * the customer read them.
   */
  readonly customerVisibleReason: 'REQUIRED' | 'FORBIDDEN';
  readonly note: 'REQUIRED' | 'OPTIONAL';
  /** The kinds this target accepts. A supplied note outside the set is refused. */
  readonly noteKinds: readonly App5NoteKind[];
}

const REQUIREMENT_OF: Readonly<Record<App5TransitionTarget, TargetRequirement>> = {
  // TR-LC11-02 and TR-LC11-04. Taking a request into review, or back into it
  // after a clarification, tells the customer nothing and needs no justification
  // beyond the operator's own optional note.
  UNDER_REVIEW: {
    internalReason: 'OPTIONAL',
    customerVisibleReason: 'FORBIDDEN',
    note: 'OPTIONAL',
    noteKinds: APP5_NOTE_KINDS,
  },
  // TR-LC11-03. SE-004 carries text to the customer, so both halves exist and
  // the note kind is pinned: a clarification recorded as `REJECT` would make the
  // history describe a decision that was not taken.
  NEEDS_CLARIFICATION: {
    internalReason: 'REQUIRED',
    customerVisibleReason: 'REQUIRED',
    note: 'REQUIRED',
    noteKinds: ['CLARIFY'],
  },
  // TR-LC11-10. SE-012. `SPAM` and `REJECT` are both refusals and the operator
  // chooses which one the record should say; `CLARIFY` and `NOTE` are not
  // refusals and are refused here.
  REJECTED: {
    internalReason: 'REQUIRED',
    customerVisibleReason: 'REQUIRED',
    note: 'REQUIRED',
    noteKinds: ['REJECT', 'SPAM'],
  },
  // TR-LC11-11, stage S1 only (`G01-D06`). Both texts are required — the
  // internal one lands on `cancelled_reason` and the customer's on
  // `cancelled_customer_reason` — and the note stays optional, exactly as
  // `APP5-G01` §2 marks it.
  CANCELLED: {
    internalReason: 'REQUIRED',
    customerVisibleReason: 'REQUIRED',
    note: 'OPTIONAL',
    noteKinds: APP5_NOTE_KINDS,
  },
  // TR-LC11-07 (`APP6-B06`). Every field is decided here rather than left to
  // resemble a neighbour, because starting digitizing is workflow progression
  // and not one of the four moderation outcomes around it. Neither reason is
  // required — nothing is being refused, so there is no decision to justify —
  // and a customer-visible one is *forbidden*: DB3 LC-11 maps no notification
  // to this move and `APP6-G01` §4 records its outbox column as `none`, so a
  // text written here would be a message with no delivery that `APP5-B03`
  // would then show as the explanation of a state the customer was never told
  // about. The note stays optional (the evidence this move owes is its TBL-042
  // row) and only `NOTE` describes it: `CLARIFY`, `REJECT` and `SPAM` are all
  // refusals, and inheriting the full set would let an operator file a
  // rejection note against a request that has just started being worked on.
  DIGITIZING: {
    internalReason: 'OPTIONAL',
    customerVisibleReason: 'FORBIDDEN',
    note: 'OPTIONAL',
    noteKinds: ['NOTE'],
  },
};

/** The command as the policy sees it: presence and kind, never the operator. */
export interface ModerationCommandShape {
  readonly to: CustomRequestState;
  readonly internalReason: string | undefined;
  readonly customerVisibleReason: string | undefined;
  readonly note: string | undefined;
  readonly noteKind: App5NoteKind | undefined;
}

/**
 * Everything a moderation command can be refused for, before any write.
 *
 * A closed union so the caller's mapping is exhaustive: a rule added here
 * without an HTTP answer stops compiling.
 */
export type ModerationPolicyFailure =
  | 'INVALID_TRANSITION'
  /** GRD-005 — `DIGITIZING` commanded before the quotation was accepted. */
  | 'QUOTE_NOT_ACCEPTED'
  | 'TRANSITION_REASON_REQUIRED'
  | 'TRANSITION_CUSTOMER_REASON_REQUIRED'
  | 'TRANSITION_CUSTOMER_REASON_NOT_ALLOWED'
  | 'MODERATION_NOTE_REQUIRED'
  | 'MODERATION_NOTE_KIND_INVALID';

/**
 * Judges one moderation command against the state the request is actually in.
 *
 * Returns the first failure, or `undefined` when the command may proceed. The
 * order matters and is not cosmetic: an illegal move is reported as an illegal
 * move rather than as a missing reason, so an operator is never told to write a
 * justification for something they were never allowed to do.
 */
export function evaluateModerationCommand(
  from: CustomRequestState,
  command: ModerationCommandShape,
): ModerationPolicyFailure | undefined {
  if (!isApp5Transition(from, command.to)) {
    // GRD-005, ahead of the generic refusal and only for the case it names. An
    // operator whose request has not been accepted yet is not sending a
    // malformed command — they are being stopped from spending digitizing
    // labour on an uncommitted job (ADR-DB3-001 r1) — and the code says so.
    // There is no override branch here and no argument that could open one.
    if (command.to === 'DIGITIZING' && PRE_ACCEPTANCE_STATES.includes(from)) {
      return 'QUOTE_NOT_ACCEPTED';
    }
    return 'INVALID_TRANSITION';
  }

  // Narrowed by the check above: `isApp5Transition` is only true for a member of
  // the target list, so the requirement lookup cannot miss.
  const requirement = REQUIREMENT_OF[command.to as App5TransitionTarget];

  if (requirement.internalReason === 'REQUIRED' && command.internalReason === undefined) {
    return 'TRANSITION_REASON_REQUIRED';
  }
  if (
    requirement.customerVisibleReason === 'REQUIRED' &&
    command.customerVisibleReason === undefined
  ) {
    return 'TRANSITION_CUSTOMER_REASON_REQUIRED';
  }
  if (
    requirement.customerVisibleReason === 'FORBIDDEN' &&
    command.customerVisibleReason !== undefined
  ) {
    return 'TRANSITION_CUSTOMER_REASON_NOT_ALLOWED';
  }
  if (
    requirement.note === 'REQUIRED' &&
    (command.note === undefined || command.noteKind === undefined)
  ) {
    return 'MODERATION_NOTE_REQUIRED';
  }
  // A note is judged whenever one was supplied, required or not: an optional
  // note still has to describe the action it accompanies.
  if (command.noteKind !== undefined && !requirement.noteKinds.includes(command.noteKind)) {
    return 'MODERATION_NOTE_KIND_INVALID';
  }
  // A kind with no text, or text with no kind, is neither an append nor an
  // omission. Reported as a missing note rather than accepted half-formed.
  if ((command.note === undefined) !== (command.noteKind === undefined)) {
    return 'MODERATION_NOTE_REQUIRED';
  }
  return undefined;
}

/**
 * Whether this target tells the customer anything (`APP5-G01` §8).
 *
 * The three SE-004/SE-012 targets, and the same predicate `APP5-B03`'s
 * projection uses to decide which statuses may show a reason at all — kept as
 * one function so the outbox and the customer's status page can never disagree
 * about which moves the customer is told about.
 */
const NOTIFIES_CUSTOMER: Readonly<Record<App5TransitionTarget, boolean>> = {
  UNDER_REVIEW: false,
  NEEDS_CLARIFICATION: true,
  REJECTED: true,
  CANCELLED: true,
  /** `APP6-B06`: TR-LC11-07 notifies nobody (`APP6-G01` §4, outbox `none`). */
  DIGITIZING: false,
};

/**
 * An exhaustive `Record` rather than the `!== 'UNDER_REVIEW'` this started as:
 * a target added without a decision here would default to *notifying*, and
 * `DIGITIZING` is exactly such a target.
 */
export function notifiesCustomer(to: App5TransitionTarget): boolean {
  return NOTIFIES_CUSTOMER[to];
}
