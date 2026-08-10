'use client';

/**
 * The one working Design Document (`APP3-S03`).
 *
 * Until this checkpoint the Studio only ever *read* a document: the Session
 * snapshot arrived from `APP3-B07` and the renderer drew it. S03 is the first
 * thing that changes one, so there has to be exactly one place a change lands —
 * otherwise the Session hook, the transform gesture and the renderer each hold
 * a copy and the question "what is on the stage" has three answers that agree
 * until the first refused candidate.
 *
 * ## Runtime only
 *
 * Nothing here is sent, saved or restored. No autosave call, no timer, no
 * `localStorage`, `sessionStorage`, `IndexedDB`, URL or cookie: `APP3-S10` owns
 * persistence, conflict and resume, and `APP3-S08` owns history. A working
 * document that quietly survived a reload would be a save nobody reviewed.
 *
 * ## What may be in here
 *
 * A `DesignDocument` and a string. The document type is closed over JSON
 * scalars by construction (`APP3-P01`), so a DOM node, an `SVGElement`, a
 * pointer event, a matrix object, a RAF handle or a function cannot reach this
 * store even by accident.
 */
import type { DesignDocument } from '@embroidery/design-document';
import { create } from 'zustand';

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
   * design, and edits must not survive into it.
   */
  readonly sessionKey: string | null;
  readonly document: DesignDocument | null;
  readonly initialize: (sessionKey: string, document: DesignDocument) => void;
  /** Replaces the working document with an already-validated candidate. */
  readonly commit: (document: DesignDocument) => void;
  readonly reset: () => void;
}

export const useStudioDocumentStore = create<StudioDocumentState>()((set) => ({
  sessionKey: null,
  document: null,
  initialize: (sessionKey, document) => {
    set((state) => (state.sessionKey === sessionKey ? state : { sessionKey, document }));
  },
  commit: (document) => {
    set({ document });
  },
  reset: () => {
    set({ sessionKey: null, document: null });
  },
}));
