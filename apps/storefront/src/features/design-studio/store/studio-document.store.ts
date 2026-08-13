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
 * Nothing here is sent, saved or restored, and that is unchanged by `APP3-S10`:
 * no timer, no request, no `localStorage`, `sessionStorage`, `IndexedDB`, URL or
 * cookie lives in this store. `APP3-S10` owns the autosave loop and calls it from
 * a controller above; what it added *here* is two seams for the other direction —
 * a document arriving **from** the server — because a store that could only be
 * written by the customer would have forced a save response to be replayed as
 * though the customer had made it.
 *
 * ## The two server-origin seams
 *
 * - `reconcile` — the server accepted this exact document and returned its
 *   canonical form. Not a history entry: the customer did nothing, so there is
 *   nothing to undo. The past and the future are left exactly as they were.
 * - `adoptServerBranch` — the working document is being *replaced* by an
 *   authoritative one: a resume the customer accepted, or the latest server
 *   document after a conflict. The local past described a branch that no longer
 *   leads to what is on screen, so it is discarded rather than kept — an undo
 *   that reached back into a discarded branch would restore a design the
 *   customer explicitly chose to abandon.
 *
 * Neither is reachable from an editing capability. Both are unconditional, which
 * `initialize` deliberately is not: a resume can legitimately return the *same*
 * revision, and a key-guarded write would then silently ignore the authoritative
 * document it was given.
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
  /**
   * How many times the working document has been written, and which of those
   * writes came from the server (`APP3-S10`).
   *
   * The autosave controller has to answer one question the document alone cannot:
   * *did the customer change this, or did a save response?* Comparing document
   * identities cannot tell them apart — both produce a new object — so a
   * server-origin write records its own serial, and a controller comparing the
   * two knows whether the latest write is something to save.
   *
   * Counters, not documents. Nothing renders them and nothing persists them.
   */
  readonly documentSerial: number;
  readonly serverSerial: number;
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
  /** Adopts the canonical form of a document the server just accepted. */
  readonly reconcile: (document: DesignDocument) => void;
  /** Replaces the working document and its whole past with an authoritative one. */
  readonly adoptServerBranch: (sessionKey: string, document: DesignDocument) => void;
}

export const useStudioDocumentStore = create<StudioDocumentState>()((set, get) => ({
  sessionKey: null,
  document: null,
  history: EMPTY_HISTORY,
  openAction: null,
  nextSeq: 1,
  documentSerial: 0,
  serverSerial: 0,

  initialize: (sessionKey, document) => {
    set((state) =>
      state.sessionKey === sessionKey
        ? state
        : // A different Session is a different design. Its snapshot becomes the
          // new baseline and there is nothing behind it: an undo that reached
          // back into the previous Session would restore coordinates that mean
          // something else on this one.
          //
          // The snapshot came from the server, so the write is recorded as a
          // server-origin one. A bootstrap counted as an edit would autosave the
          // document straight back to the revision it was just read from.
          serverWrite(state, { sessionKey, document, history: EMPTY_HISTORY, openAction: null }),
    );
  },

  commit: (document, action) => {
    set((state) => {
      const open = state.openAction;
      const serial = state.documentSerial + 1;
      // A commit from a *different* capability while a gesture or a text session
      // is open closes that one on its own terms first, rather than folding an
      // unrelated action into it.
      if (open !== null && open.action.kind === action.kind)
        return { document, documentSerial: serial };

      const before = state.document;
      if (before === null) return { document, openAction: null, documentSerial: serial };

      const closed = open === null ? state.history : closeOpen(state, open);
      const seq = seqAfter(state, closed);
      return {
        document,
        openAction: null,
        documentSerial: serial,
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
      // An undo changes the working document, so it is a document mutation the
      // autosave loop must see. `APP3-S10` §23: undo and redo are dirty.
      documentSerial: state.documentSerial + 1,
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
      documentSerial: state.documentSerial + 1,
    });
  },

  reset: () => {
    set((state) =>
      serverWrite(state, {
        sessionKey: null,
        document: null,
        history: EMPTY_HISTORY,
        openAction: null,
      }),
    );
  },

  reconcile: (document) => {
    set((state) => {
      // Only when the canonical form actually differs. `APP3-P01` quantizes on
      // the way in, so the usual answer is that it does not — and rewriting the
      // document with an equal value would re-render the whole scene for nothing.
      if (state.document !== null && sameDocument(state.document, document)) return state;
      // The history is untouched on purpose. The customer performed no action, so
      // there is nothing to undo; `entries[cursor - 1].after` is now the
      // pre-canonical form of this document, and an undo from here still restores
      // the state before the customer's last action, which is what undo means.
      return serverWrite(state, { document });
    });
  },

  adoptServerBranch: (sessionKey, document) => {
    set((state) =>
      serverWrite(state, {
        sessionKey,
        document,
        // The past described a branch the customer has just abandoned. Keeping it
        // would let one undo resurrect a design they explicitly replaced.
        history: EMPTY_HISTORY,
        openAction: null,
      }),
    );
  },
}));

/**
 * A write the server originated, stamped so the autosave loop does not read it
 * back as something the customer did.
 *
 * Both counters move together. A controller comparing them sees equality and
 * knows the newest write was not an edit — which is what keeps a save response
 * from scheduling the save that would send it straight back.
 */
function serverWrite(
  state: Pick<StudioDocumentState, 'documentSerial'>,
  patch: Partial<StudioDocumentState>,
): Partial<StudioDocumentState> {
  const serial = state.documentSerial + 1;
  return { ...patch, documentSerial: serial, serverSerial: serial };
}

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
