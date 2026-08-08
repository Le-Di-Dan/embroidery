'use client';

/**
 * The editing session: draft, selection, conflict and save outcome.
 *
 * Kept out of the screen component so the screen renders and this decides. The
 * rules that live here are the ones a component must not be trusted with:
 *
 * *The draft is re-seeded from the server token, not from an event.* Whenever
 * the authoritative snapshot arrives under a token this session has not seeded
 * from — first load, or a successful save, or a reload — the draft becomes that
 * snapshot. Re-seeding on "save succeeded" instead would drift the moment any
 * other path updated the cache.
 *
 * *A conflict never re-seeds.* `PLACEMENT_VERSION_CONFLICT` writes nothing on
 * the server, so the cached snapshot is unchanged and the operator's draft must
 * survive untouched until they choose. Discarding it here is exactly the data
 * loss the conflict dialog exists to prevent.
 *
 * *`expectedUpdatedAt` comes from the draft's own seed.* Never from the current
 * cache entry and never from a token a previous conflict already rejected.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import type { PlacementDraft } from '../model/placement-draft';
import { isVersionConflict, type PlacementSaveFailure } from '../model/placement-failure';
import { classifySaveFailure } from '../model/placement-failure';
import type { PlacementModel } from '../model/placement-model';
import { placementReducer, type PlacementAction } from '../model/placement-reducer';
import { NO_SELECTION, type PlacementSelection } from '../model/placement-selection';

const EMPTY_DRAFT: PlacementDraft = { productId: '', expectedUpdatedAt: '', sides: [] };

export interface PlacementSession {
  readonly draft: PlacementDraft;
  readonly selection: PlacementSelection;
  readonly conflicted: boolean;
  /**
   * Whether the modal is still asking. Separate from `conflicted` on purpose:
   * dismissing the dialog must not clear the conflict, because the draft's
   * token is still stale and saving would still fail. The banner and the
   * disabled save survive; only the interruption goes away.
   */
  readonly conflictDialogOpen: boolean;
  readonly saved: boolean;
  readonly failure: PlacementSaveFailure | null;
  readonly dispatch: (action: PlacementAction) => void;
  readonly select: (selection: PlacementSelection) => void;
  /** Re-seeds from an authoritative snapshot and clears the conflict. */
  readonly acceptServerTruth: (model: PlacementModel) => void;
  readonly recordFailure: (error: unknown) => void;
  readonly recordSaved: () => void;
  readonly beginSave: () => void;
  readonly discard: (model: PlacementModel) => void;
  /** Closes the dialog and keeps the unsaved draft on screen for comparison. */
  readonly keepDraft: () => void;
}

export function usePlacementDraft(model: PlacementModel | undefined): PlacementSession {
  const [draft, dispatch] = useReducer(placementReducer, EMPTY_DRAFT);
  const [selection, setSelection] = useState<PlacementSelection>(NO_SELECTION);
  const [conflicted, setConflicted] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<PlacementSaveFailure | null>(null);

  /** The token the current draft was seeded from; `null` before first load. */
  const seededToken = useRef<string | null>(null);

  useEffect(() => {
    if (model === undefined || seededToken.current === model.updatedAt) {
      return;
    }
    seededToken.current = model.updatedAt;
    dispatch({ type: 'seed', model });
    setConflicted(false);
    setConflictDialogOpen(false);
    setFailure(null);
    setSelection((current) => (current.kind === 'none' ? current : NO_SELECTION));
  }, [model]);

  const acceptServerTruth = useCallback((next: PlacementModel) => {
    seededToken.current = next.updatedAt;
    dispatch({ type: 'seed', model: next });
    setConflicted(false);
    setConflictDialogOpen(false);
    setFailure(null);
    setSelection(NO_SELECTION);
  }, []);

  const discard = useCallback((next: PlacementModel) => {
    seededToken.current = next.updatedAt;
    dispatch({ type: 'seed', model: next });
    setFailure(null);
    setSaved(false);
    setSelection(NO_SELECTION);
  }, []);

  const recordFailure = useCallback((error: unknown) => {
    const conflict = isVersionConflict(error);
    setSaved(false);
    setFailure(classifySaveFailure(error));
    setConflicted(conflict);
    setConflictDialogOpen(conflict);
  }, []);

  const recordSaved = useCallback(() => {
    setSaved(true);
    setFailure(null);
    setConflicted(false);
    setConflictDialogOpen(false);
  }, []);

  const beginSave = useCallback(() => {
    setSaved(false);
    setFailure(null);
  }, []);

  const keepDraft = useCallback(() => {
    setConflictDialogOpen(false);
  }, []);

  return {
    draft: model === undefined ? EMPTY_DRAFT : draft,
    selection,
    conflicted,
    conflictDialogOpen,
    saved,
    failure,
    dispatch,
    select: setSelection,
    acceptServerTruth,
    recordFailure,
    recordSaved,
    beginSave,
    discard,
    keepDraft,
  };
}
