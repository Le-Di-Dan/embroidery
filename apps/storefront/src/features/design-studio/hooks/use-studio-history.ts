'use client';

/**
 * The history capability's controller (`APP3-S08`).
 *
 * Thin on purpose. The past, the future and the cursor live in the store beside
 * the one working document, because that is what keeps them from becoming a
 * second current document; this hook projects them into rows a panel can draw
 * and announces what happened.
 *
 * Nothing here calls the API. An undo restores a document this browser already
 * held — it does not ask `APP3-B08` to save one, does not move the Session
 * revision, does not delete an Asset and does not upload anything. The network
 * delta of every command here is zero.
 */
import { useCallback, useMemo, useState } from 'react';

import { STUDIO_HISTORY_COPY } from '../model/studio-history-copy';
import {
  canRedo,
  canUndo,
  historyLabel,
  historyRowsOf,
  redoTarget,
  undoTarget,
  type StudioHistoryRow,
} from '../model/studio-history';
import { useStudioDocumentStore } from '../store/studio-document.store';

export interface UseStudioHistoryResult {
  readonly rows: readonly StudioHistoryRow[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The last thing that happened, for a polite live region. */
  readonly announcement: string;
  readonly undo: () => void;
  readonly redo: () => void;
}

export function useStudioHistory(): UseStudioHistoryResult {
  const history = useStudioDocumentStore((state) => state.history);
  const undoDocument = useStudioDocumentStore((state) => state.undo);
  const redoDocument = useStudioDocumentStore((state) => state.redo);
  const [announcement, setAnnouncement] = useState('');

  /*
   * The label is read *before* the command runs, because the command moves the
   * cursor the label is read from. Announcing afterwards would name the entry
   * that is now next rather than the one that just happened.
   */
  const undo = useCallback(() => {
    const entry = undoTarget(history);
    if (entry === null) return;
    undoDocument();
    setAnnouncement(STUDIO_HISTORY_COPY.undone(historyLabel(entry.action)));
  }, [history, undoDocument]);

  const redo = useCallback(() => {
    const entry = redoTarget(history);
    if (entry === null) return;
    redoDocument();
    setAnnouncement(STUDIO_HISTORY_COPY.redone(historyLabel(entry.action)));
  }, [history, redoDocument]);

  /*
   * The rows, rebuilt only when the history itself changes.
   *
   * A gesture commits the working document on every pointer frame, so the stage
   * screen re-renders on every pointer frame — and the store leaves `history`
   * untouched for the whole of a coalesced action. Projecting it unconditionally
   * would hand the panel a new array sixty times a second and re-render up to
   * fifty rows inside the frame budget `ADR-APP0-001` §6 froze, for a list that
   * cannot have changed. This is the same cost `APP3-S03-C1` measured and
   * removed for the scene: a hundred React subtrees rebuilt for one drag.
   */
  const rows = useMemo(() => historyRowsOf(history), [history]);

  return {
    rows,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    announcement,
    undo,
    redo,
  };
}
