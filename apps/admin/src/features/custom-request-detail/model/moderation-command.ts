/**
 * What the operator typed, validated, and turned into the exact generated body.
 *
 * ### The payload is built by *addition*, never by trimming a full object
 *
 * Each target contributes only the fields `APP5-B05` accepts for it. That is
 * what makes "`UNDER_REVIEW` carries no customer-visible reason" structural: the
 * review branch never writes the key, so there is no path on which an empty
 * string, a `null` or a leftover value from a previously opened dialog reaches
 * the wire and earns a `TRANSITION_CUSTOMER_REASON_NOT_ALLOWED`.
 *
 * ### Server-owned fields are absent by construction
 *
 * `TransitionCustomRequestBody` has exactly five members and none of them is an
 * actor, a source state, a sequence, a timestamp or a correlation id. The screen
 * builds that type and nothing else, so `expectedFrom`, `adminId`, `actorKind`
 * and their relatives are not "not sent" — they have nowhere to go. The state
 * the request is moving *from* is read and locked by the server.
 *
 * ### Note and kind travel together or not at all
 *
 * `APP5-B05` refuses a note with no kind and a kind with no note as
 * `MODERATION_NOTE_REQUIRED`. The optional-note targets therefore emit both keys
 * or neither, which is why the cancel branch cannot send a bare `moderationNote`
 * however the dialog is filled in.
 */
import type { TransitionCustomRequestBody, AppendModerationNoteBody } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from './custom-request-detail-copy';
import type { ModerationSurface, ModerationTarget } from './moderation-actions';

/** The contract's own bound on every text field. */
export const MODERATION_TEXT_MAX_LENGTH = 2000;

/** The note kinds `APP5-B05` exposes. `PAUSE` is excluded — APP5 pauses nothing. */
export type ModerationNoteKind = 'CLARIFY' | 'REJECT' | 'SPAM' | 'NOTE';

/**
 * The two kinds a rejection may be recorded as.
 *
 * `REJECT` is first and is the ordinary default. `SPAM` is a distinct
 * accusation about the customer rather than a verdict about the request, so it
 * is only ever an explicit choice — a screen that defaulted to it would file
 * every declined request as abuse.
 */
export const REJECT_NOTE_KINDS: readonly ModerationNoteKind[] = ['REJECT', 'SPAM'] as const;
export const DEFAULT_REJECT_NOTE_KIND: ModerationNoteKind = 'REJECT';

/** What the operator has typed into whichever dialog is open. */
export interface ModerationFormValues {
  readonly internalReason: string;
  readonly customerVisibleReason: string;
  readonly note: string;
  readonly rejectNoteKind: ModerationNoteKind;
}

export const EMPTY_MODERATION_FORM: ModerationFormValues = {
  internalReason: '',
  customerVisibleReason: '',
  note: '',
  rejectNoteKind: DEFAULT_REJECT_NOTE_KIND,
};

/** Which fields carry a validation message, keyed by the field they belong to. */
export interface ModerationFormErrors {
  readonly internalReason?: string;
  readonly customerVisibleReason?: string;
  readonly note?: string;
}

function trimmed(value: string): string | undefined {
  const text = value.trim();
  return text === '' ? undefined : text;
}

function lengthError(value: string | undefined): string | undefined {
  return value !== undefined && value.length > MODERATION_TEXT_MAX_LENGTH
    ? COPY.validation.tooLong
    : undefined;
}

/**
 * Validates one dialog's fields against what its target requires.
 *
 * A mirror of the server's policy, and deliberately no stricter: the point is to
 * tell the operator what is missing before a round trip, not to invent a rule
 * `APP5-B05` does not have. Cancellation in particular requires both reasons and
 * leaves the note optional, exactly as the policy marks it.
 */
export function validateModerationForm(
  surface: ModerationSurface,
  values: ModerationFormValues,
): ModerationFormErrors {
  if (surface === 'direct') return {};

  const internal = trimmed(values.internalReason);
  const customer = trimmed(values.customerVisibleReason);
  const note = trimmed(values.note);
  const noteRequired = surface === 'clarify' || surface === 'reject';

  const errors: {
    internalReason?: string;
    customerVisibleReason?: string;
    note?: string;
  } = {};

  const internalError =
    internal === undefined ? COPY.validation.internalRequired : lengthError(internal);
  if (internalError !== undefined) errors.internalReason = internalError;

  const customerError =
    customer === undefined ? COPY.validation.customerRequired : lengthError(customer);
  if (customerError !== undefined) errors.customerVisibleReason = customerError;

  const noteError =
    noteRequired && note === undefined ? COPY.validation.noteRequired : lengthError(note);
  if (noteError !== undefined) errors.note = noteError;

  return errors;
}

export function hasValidationErrors(errors: ModerationFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The note kind each surface records its decision under. */
function noteKindFor(
  surface: ModerationSurface,
  values: ModerationFormValues,
): ModerationNoteKind | undefined {
  switch (surface) {
    // Pinned by the policy: a clarification filed as `REJECT` would make the
    // history describe a decision that was not taken.
    case 'clarify':
      return 'CLARIFY';
    case 'reject':
      return values.rejectNoteKind;
    // A cancellation note is optional and freeform, so it is an ordinary `NOTE`
    // — the cancellation itself is recorded by the transition, not by the kind.
    case 'cancel':
      return 'NOTE';
    default:
      return undefined;
  }
}

/**
 * The exact `TransitionCustomRequestBody` for one command.
 *
 * Assumes the form already validated: this builds a body, it does not decide
 * whether one may be sent.
 */
export function buildTransitionBody(
  target: ModerationTarget,
  surface: ModerationSurface,
  values: ModerationFormValues,
): TransitionCustomRequestBody {
  // Both `UNDER_REVIEW` moves. The target is the whole command: no internal
  // reason (no approved frame collects one), and a customer-visible reason is
  // forbidden — `APP5-G01` §8 maps no notification to this move, so text written
  // here would be a message with no delivery that `APP5-B03` would then show the
  // customer as the explanation of a state they were never told about.
  if (surface === 'direct') {
    return { toStatus: 'UNDER_REVIEW' };
  }

  const internalReason = trimmed(values.internalReason);
  const customerVisibleReason = trimmed(values.customerVisibleReason);
  const note = trimmed(values.note);
  const noteKind = noteKindFor(surface, values);

  return {
    toStatus: target,
    ...(internalReason === undefined ? {} : { internalReason }),
    ...(customerVisibleReason === undefined ? {} : { customerVisibleReason }),
    // Both keys or neither: a kind with no text is refused as a missing note.
    ...(note === undefined || noteKind === undefined
      ? {}
      : {
          moderationNote: note,
          moderationNoteKind: noteKind,
        }),
  };
}

/**
 * The body for a standalone note.
 *
 * `NOTE` is the kind, always. A freeform note an operator writes while reading a
 * request is an observation, not a moderation decision — filing it as `CLARIFY`,
 * `REJECT` or `SPAM` would put a verdict in the record that nobody reached and
 * that no transition backs up. The three decision kinds are written by the
 * dialogs that actually perform those decisions.
 *
 * Nothing else is sent: the operator, the sequence and the timestamp are all
 * derived server-side, and there is no client-side note id.
 */
export function buildAppendNoteBody(note: string): AppendModerationNoteBody {
  return { kind: 'NOTE', note: note.trim() };
}

/** Whether a standalone note may be submitted at all. */
export function validateStandaloneNote(note: string): string | undefined {
  const text = trimmed(note);
  if (text === undefined) return COPY.validation.noteRequired;
  return lengthError(text);
}
