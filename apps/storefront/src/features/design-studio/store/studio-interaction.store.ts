'use client';

/**
 * The Studio's browser-only interaction state (`APP3-S02`).
 *
 * Exactly one fact lives here — which element the customer has selected — and
 * that is the whole store on purpose. It is the locked home for editor
 * interaction state, and the temptation it exists to resist is pre-building the
 * shape later checkpoints will want: a viewport for `APP3-S07`, a history stack
 * for `S08`, an upload queue for `S06`, a layer order for `S04`. Each of those
 * would be a slot with nothing to put in it and a name that later has to change.
 *
 * ## What may never be in here
 *
 * Only serializable, engine-neutral values. No `SVGElement`, DOM node,
 * `DOMRect`, `DOMMatrix`, matrix object, `AbortController`, `Blob`, object URL,
 * renderer instance, mutable `APP3-P02` graph, React ref or `Error`. A mutable
 * runtime object in a store outlives the render that made it and is shared by
 * every reader, which is how a revoked object URL or a detached node stays
 * reachable long after the thing it pointed at is gone.
 *
 * No server state either: the Design Document is the Session snapshot's, and
 * duplicating it here would create a second answer to "what is in this design".
 * The selection is a *reference into* that document, not a copy of any part of
 * it.
 *
 * ## Selection is never persisted
 *
 * Not to the document, not to the API, not to `localStorage`. A saved design is
 * what the customer made; where their cursor was when they stopped is not part
 * of it, and `APP3-P01` has no field for it precisely so it cannot become one.
 */
import { create } from 'zustand';

export interface StudioInteractionState {
  /** The one selected element, or `null`. Never an array — S02 is single-select. */
  readonly selectedElementId: string | null;
  readonly selectElement: (elementId: string) => void;
  readonly clearSelection: () => void;
  /**
   * Drops a selection whose element is no longer on the stage.
   *
   * Called with the ids the current scene actually renders. A document that
   * changed underneath the selection — a different Session, a document the
   * stage can no longer read — leaves an id pointing at nothing, and an
   * outline drawn from nothing is worse than no outline.
   */
  readonly reconcileSelection: (presentElementIds: readonly string[]) => void;
}

export const useStudioInteractionStore = create<StudioInteractionState>()((set) => ({
  selectedElementId: null,
  selectElement: (elementId) => {
    // Replaces rather than accumulates: selecting a second element deselects
    // the first, which is the whole of S02's selection model.
    set({ selectedElementId: elementId });
  },
  clearSelection: () => {
    set({ selectedElementId: null });
  },
  reconcileSelection: (presentElementIds) => {
    set((state) =>
      state.selectedElementId !== null && !presentElementIds.includes(state.selectedElementId)
        ? { selectedElementId: null }
        : state,
    );
  },
}));
