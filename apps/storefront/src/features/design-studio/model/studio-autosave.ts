/**
 * The autosave state model (`APP3-S10`).
 *
 * Pure. No timer, no request, no store and no React: everything here is a value
 * or a function of values, so the cadence arithmetic and the reconciliation
 * decision can be proved without a clock and without a network.
 *
 * ## What the states mean
 *
 * The customer's document lives in the browser and the server holds the last
 * revision it accepted. These seven states are every way those two can stand to
 * one another that the customer must be told about — and the only ones.
 */
import type { DesignDocument } from '@embroidery/design-document';

import { isStudioApiError } from './studio-failure';

/**
 * Quiet time before a save becomes eligible.
 *
 * `APP3-D01` left the cadence open for this checkpoint and `APP3-G04` §6.7
 * routed it here. It is chosen against two ceilings and one human fact: the
 * `APP3-B06A`/`APP3-G03` limit of **30 mutations per minute per Session**, the
 * one-in-flight rule, and the length of a pause that reads as "I have stopped
 * typing" rather than "the tool is lagging".
 */
export const AUTOSAVE_DEBOUNCE_MS = 2500;

/**
 * How long a continuously edited document may stay unsaved.
 *
 * The debounce alone is unbounded under continuous editing: a customer dragging
 * for a minute never produces 2500 ms of quiet, and every frame of that minute
 * would be unsaved. This is the ceiling on that — measured from the **first**
 * dirty mutation of a streak, not the last, so it cannot be pushed forward by
 * more editing.
 *
 * At its worst the pair asks for one save every 10 s, which is 6/minute against
 * a ceiling of 30 and leaves the customer's own explicit retries room underneath
 * it.
 */
export const AUTOSAVE_MAX_DIRTY_AGE_MS = 10_000;

/**
 * The bounded automatic retry ladder.
 *
 * Two attempts and then a stop. An unbounded ladder is how a browser tab with no
 * network keeps a request loop alive for an hour; the approved copy promises
 * that the system retries *and* that the customer may retry, and that promise is
 * kept by two automatic attempts plus a button, not by an infinite timer.
 */
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = Object.freeze([5000, 15_000]);

/**
 * Where the working document stands against the last accepted revision.
 *
 * - `CLEAN` — the server holds this exact document.
 * - `DIRTY` — the browser holds edits the server has not accepted yet.
 * - `SAVING` — one request is in flight. Editing continues underneath it.
 * - `RECONCILING` — the outcome of a save is *unknown* or refused as stale, and
 *   the latest server state is being read before anything else is decided. No
 *   write may be replayed from here.
 * - `CONFLICT` — the server moved on. Two documents exist and the customer, not
 *   this code, chooses between them.
 * - `ERROR_PAUSED` — saving failed and the automatic attempts are spent. The
 *   document is still on screen and still unsaved.
 * - `EXPIRED` — the Session is gone. Nothing may be saved into it again.
 */
export type StudioSaveState =
  'CLEAN' | 'DIRTY' | 'SAVING' | 'RECONCILING' | 'CONFLICT' | 'ERROR_PAUSED' | 'EXPIRED';

/**
 * Why a save failed, in terms of what may be done next.
 *
 * Derived from HTTP status and from the *absence* of one. It never reads the
 * message: `APP3-B07` and `APP3-B08` collapse invisible states into fixed
 * sentences, so branching on prose would be branching on a field the server
 * refuses to make meaningful.
 */
export type StudioSaveFailure =
  'expired' | 'refused' | 'conflict' | 'rejected' | 'throttled' | 'server' | 'ambiguous';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

/**
 * A save whose outcome nobody knows.
 *
 * `normalizeApiClientError` reports `httpStatus` only when a response was
 * actually received. Its absence is a timeout, a reset connection, a dropped
 * radio or a browser that refused the request — and from the client's side those
 * are **the same event**, because the PUT may have reached the server and had
 * its response lost. So they collapse into one classification, and that
 * classification is the one thing that may never be replayed blindly.
 */
export function classifySaveFailure(error: unknown): StudioSaveFailure {
  const status = isStudioApiError(error) ? error.normalized.httpStatus : undefined;
  if (status === undefined) return 'ambiguous';
  if (status === HTTP_UNAUTHORIZED) return 'expired';
  if (status === HTTP_FORBIDDEN) return 'refused';
  if (status === HTTP_CONFLICT) return 'conflict';
  if (status === HTTP_PAYLOAD_TOO_LARGE || status === HTTP_UNPROCESSABLE) return 'rejected';
  if (status === HTTP_TOO_MANY_REQUESTS) return 'throttled';
  if (status >= HTTP_SERVER_ERROR) return 'server';
  // Any other 4xx is a refusal this client cannot make actionable by repeating
  // it. It stops rather than joining the retry ladder.
  return 'refused';
}

/** Whether a failure may be attempted again without asking the customer first. */
export function isRetryableFailure(failure: StudioSaveFailure): boolean {
  return failure === 'server' || failure === 'throttled';
}

/** How long to wait before automatic attempt `attempt`, or `null` when spent. */
export function retryDelayFor(attempt: number): number | null {
  return AUTOSAVE_RETRY_DELAYS_MS[attempt] ?? null;
}

/** The exact document and revision one in-flight save is answering for. */
export interface StudioSaveInFlight {
  readonly submitted: DesignDocument;
  readonly expectedRevision: number;
}

/** The latest authoritative pair a reconciliation read. */
export interface StudioServerSnapshot {
  readonly document: DesignDocument;
  readonly revision: number;
}

/**
 * The states in which no timer may arm a save.
 *
 * A request is already open, the outcome of one is being established, the
 * customer owes a decision, or the Session is gone. In every one of them an
 * automatic save would either duplicate a write, replay an unknown one or
 * overwrite a document somebody else holds.
 */
export const SAVE_HELD_STATES: ReadonlySet<StudioSaveState> = new Set<StudioSaveState>([
  'SAVING',
  'RECONCILING',
  'CONFLICT',
  'EXPIRED',
]);

/** The dirty streak: when it began, and when it was last added to. */
export interface StudioDirtyStreak {
  readonly since: number;
  readonly last: number;
}

/**
 * When the next save becomes eligible, as a delay from `now`.
 *
 * `min(last + debounce, since + maxAge)` — the quiet rule and the ceiling, with
 * whichever arrives first winning. Never negative: a streak already past its
 * ceiling is eligible immediately rather than retroactively.
 */
export function saveDelayFor(streak: StudioDirtyStreak, now: number): number {
  const quiet = streak.last + AUTOSAVE_DEBOUNCE_MS;
  const ceiling = streak.since + AUTOSAVE_MAX_DIRTY_AGE_MS;
  return Math.max(0, Math.min(quiet, ceiling) - now);
}

/**
 * What the latest server snapshot says about a save whose outcome was unknown.
 *
 * - `persisted` — the server is past the base revision **and** holds exactly the
 *   document that was submitted. The save arrived; only its answer was lost.
 * - `absent` — the server is still on the base revision. Nothing was written, so
 *   the same document may be offered again.
 * - `diverged` — the server moved to something that is not what was submitted.
 *   Somebody else wrote, and this is a conflict, not a retry.
 */
export type StudioAmbiguousOutcome = 'persisted' | 'absent' | 'diverged';

export interface StudioAmbiguousInput {
  readonly baseRevision: number;
  readonly submitted: DesignDocument;
  readonly latestRevision: number;
  readonly latestDocument: DesignDocument;
  /** Document equality, injected so this module needs no canonicalizer. */
  readonly equal: (left: DesignDocument, right: DesignDocument) => boolean;
}

export function classifyAmbiguousOutcome(input: StudioAmbiguousInput): StudioAmbiguousOutcome {
  if (input.latestRevision === input.baseRevision) return 'absent';
  return input.equal(input.latestDocument, input.submitted) ? 'persisted' : 'diverged';
}

/**
 * Whether an unsaved document would be lost by closing the tab.
 *
 * The offline copy tells the customer their changes are still on screen but not
 * on the server and asks them not to close the tab. That sentence is only true
 * while nothing durably stores the document — which is exactly the case, and is
 * why this checkpoint stores a Session **id** and nothing else.
 */
/**
 * What the topbar chip says, as a token rather than a sentence.
 *
 * Six tones for seven states, because `RECONCILING` has nothing of its own to
 * say: the outcome of a save is being established, and until it is, the only
 * honest statement is that the design is not confirmed saved. It reads as
 * `dirty` — never as `saving`, which would claim a write that may already have
 * failed, and never as `saved`.
 */
export type StudioSaveTone = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict' | 'failed';

export function saveToneOf(
  state: StudioSaveState,
  failure: StudioSaveFailure | null,
): StudioSaveTone {
  if (state === 'EXPIRED') return 'failed';
  if (state === 'CONFLICT') return 'conflict';
  if (state === 'SAVING') return 'saving';
  if (state === 'CLEAN') return 'saved';
  // `DIRTY` and `ERROR_PAUSED`, with the failure deciding between them. A lost
  // connection is named as one; anything else is a failure without a diagnosis
  // the customer could act on, so it is not given one.
  if (failure === null) return 'dirty';
  return failure === 'ambiguous' ? 'offline' : 'failed';
}

const UNSAVED_STATES: ReadonlySet<StudioSaveState> = new Set<StudioSaveState>([
  'DIRTY',
  'SAVING',
  'RECONCILING',
  'CONFLICT',
  'ERROR_PAUSED',
]);

export function hasUnsavedWork(state: StudioSaveState): boolean {
  // `EXPIRED` is deliberately absent. There is nothing to warn about saving into
  // a Session that no longer exists, and a warning there would promise a
  // recovery this checkpoint is explicit about not having.
  return UNSAVED_STATES.has(state);
}
