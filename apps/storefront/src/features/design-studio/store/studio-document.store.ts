'use client';

/**
 * The one working Design Document (`APP3-S03`), and its history (`APP3-S08`).
 *
 * Until `APP3-S03` the Studio only ever *read* a document: the Session snapshot
 * arrived from `APP3-B07` and the renderer drew it. S03 is the first thing that
 * changes one, so there has to be exactly one place a change lands — otherwise
 * the Session hook, the transform gesture and the renderer each hold a copy and
 * the question "what is on the stage" has three answers that agree until the
 * first refused candidate.
 *
 * ## Why history lives here and not beside here
 *
 * `APP3-S08` adds undo and redo, and the one thing it must not add is a second
 * answer to that question. A history controller holding its own "current"
 * document next to this one would be exactly that: two currents, drifting apart
 * the first time a refused candidate updated one and not the other.
 *
 * So `document` stays the single current truth and the history is `entries` plus
 * a `cursor` beside it — past and future as *archival* values that nothing
 * renders. `entries[cursor - 1].after` is always the current document and
 * `undo`/`redo` move the cursor and write `document` in the same `set`, so the
 * two cannot disagree even for one render.
 *
 * ## Runtime only
 *
 * Nothing here is sent, saved or restored. No autosave call, no timer, no
 * `localStorage`, `sessionStorage`, `IndexedDB`, URL or cookie: `APP3-S10` owns
 * persistence, conflict and resume. A working document — or a history — that
 * quietly survived a reload would be a save nobody reviewed.
 *
 * ## What may be in here
 *
 * `DesignDocument`s, strings and numbers. The document type is closed over JSON
 * scalars by construction (`APP3-P01`), so a DOM node, an `SVGElement`, a pointer
 * event, a matrix object, a RAF handle or a function cannot reach this store even
 * by accident — and a history entry is two documents and a bounded label, so the
 * same is true of every past and future state.
 */
import type { DesignDocument } from '@embroidery/design-document';
import { create } from 'zustand';

import {
  EMPTY_HISTORY,
  recordAction,
  redoTarget,
  sameDocument,
  undoTarget,
  type StudioHistoryAction,
  type StudioHistoryEntry,
  type StudioHistoryState,
} from '../model/studio-history';

/**
 * A meaningful action in progress, and the document it started from.
 *
 * The whole of `APP3-S08` §10 and §11: a drag commits the working document on
 * many pointer frames and a text session commits it on many keystrokes, and both
 * are *one* thing the customer did. While this is open every commit updates the
 * document and appends nothing; closing it compares the ends and appends at most
 * one entry.
 */
interface OpenAction {
  readonly action: StudioHistoryAction;
  readonly baseline: DesignDocument;
}

export interface StudioDocumentState {
  /**
   * Which Session and revision the working document was initialized from.
   *
   * An opaque key composed outside this module (`studio-session-key.ts`), so
   * no Session identity ever comes to rest in a store — `APP3-S01`'s rule,
   * unrelaxed.
   *
   * The key is the whole guard. `initialize` on the same key is a no-op, so a
   * re-render, a re-fetch or a resume that returns the same revision cannot
   * silently discard the customer's edits; a different key is a different
   * design, and neither the edits nor the history may survive into it.
   */
  readonly sessionKey: string | null;
  readonly document: DesignDocument | null;
  /** Past and future, as archival documents. Never what the renderer reads. */
  readonly history: StudioHistoryState;
  /** The action currently being coalesced, or `null`. Runtime only. */
  readonly openAction: OpenAction | null;
  /** Mints the stable row key. Bounded metadata, never an element identity. */
  readonly nextSeq: number;
  readonly initialize: (sessionKey: string, document: DesignDocument) => void;
  /**
   * Replaces the working document with an already-validated candidate.
   *
   * The action is not optional. Every commit is something the customer did, and
   * a commit that could not name itself would be a document change with no
   * history row and no way to undo it.
   */
  readonly commit: (document: DesignDocument, action: StudioHistoryAction) => void;
  /** Opens a coalesced action. Committing while one is open appends nothing. */
  readonly beginAction: (action: StudioHistoryAction) => void;
  /** Closes it, appending one entry if the document actually changed. */
  readonly endAction: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
}

export const useStudioDocumentStore = create<StudioDocumentState>()((set, get) => ({
  sessionKey: null,
  document: null,
  history: EMPTY_HISTORY,
  openAction: null,
  nextSeq: 1,

  initialize: (sessionKey, document) => {
    set((state) =>
      state.sessionKey === sessionKey
        ? state
        : // A different Session is a different design. Its snapshot becomes the
          // new baseline and there is nothing behind it: an undo that reached
          // back into the previous Session would restore coordinates that mean
          // something else on this one.
          { sessionKey, document, history: EMPTY_HISTORY, openAction: null },
    );
  },

  commit: (document, action) => {
    set((state) => {
      const open = state.openAction;
      // A commit from a *different* capability while a gesture or a text session
      // is open closes that one on its own terms first, rather than folding an
      // unrelated action into it.
      if (open !== null && open.action.kind === action.kind) return { document };

      const before = state.document;
      if (before === null) return { document, openAction: null };

      const closed = open === null ? state.history : closeOpen(state, open);
      const seq = seqAfter(state, closed);
      return {
        document,
        openAction: null,
        nextSeq: seq + 1,
        history: recordAction(closed, { seq, action, before, after: document }),
      };
    });
  },

  beginAction: (action) => {
    set((state) => {
      if (state.document === null) return state;
      // An action already open is closed on its own terms first: two overlapping
      // gestures are two things the customer did, not one.
      const history =
        state.openAction === null ? state.history : closeOpen(state, state.openAction);
      return {
        history,
        nextSeq: seqAfter(state, history),
        openAction: { action, baseline: state.document },
      };
    });
  },

  endAction: () => {
    set((state) => {
      const open = state.openAction;
      if (open === null) return state;
      const history = closeOpen(state, open);
      return { openAction: null, history, nextSeq: seqAfter(state, history) };
    });
  },

  undo: () => {
    const state = get();
    const entry = undoTarget(state.history);
    if (entry === null) return;
    // Straight into `document`, never through `commit` — an undo that recorded
    // itself would append an entry the next undo would then reverse, and the
    // customer would never reach the state before it.
    set({
      document: entry.before,
      history: { entries: state.history.entries, cursor: state.history.cursor - 1 },
      openAction: null,
    });
  },

  redo: () => {
    const state = get();
    const entry = redoTarget(state.history);
    if (entry === null) return;
    set({
      document: entry.after,
      history: { entries: state.history.entries, cursor: state.history.cursor + 1 },
      openAction: null,
    });
  },

  reset: () => {
    set({
      sessionKey: null,
      document: null,
      history: EMPTY_HISTORY,
      openAction: null,
    });
  },
}));

/**
 * The next unused sequence number, given what closing an action actually did.
 *
 * A close that appended nothing consumed nothing, so the counter must not move.
 * Advancing it unconditionally would be harmless for keys and wrong for anyone
 * later reading the counter as "how many actions this runtime has recorded".
 */
function seqAfter(
  state: Pick<StudioDocumentState, 'history' | 'nextSeq'>,
  closed: StudioHistoryState,
): number {
  return closed === state.history ? state.nextSeq : state.nextSeq + 1;
}

/**
 * The history an open action leaves behind.
 *
 * Unchanged when nothing happened between the two ends — a gesture every frame
 * of which was refused, a drag out and back to where it started, a text session
 * the customer left exactly as they found it. `APP3-S08` §7 is explicit that a
 * semantically unchanged before/after adds zero history, and this is the one
 * place that judgement is made.
 */
function closeOpen(
  state: Pick<StudioDocumentState, 'document' | 'history' | 'nextSeq'>,
  open: OpenAction,
): StudioHistoryState {
  const after = state.document;
  if (after === null || sameDocument(open.baseline, after)) return state.history;
  const entry: StudioHistoryEntry = {
    seq: state.nextSeq,
    action: open.action,
    before: open.baseline,
    after,
  };
  return recordAction(state.history, entry);
}
