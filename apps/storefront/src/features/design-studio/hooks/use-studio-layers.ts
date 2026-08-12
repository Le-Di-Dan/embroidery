'use client';

/**
 * The layer capability's controller (`APP3-S04`).
 *
 * Three commands — restack, hide/show, lock/unlock — and each of them is the
 * same three steps the accepted Studio already uses: build a candidate document
 * immutably, have `APP3-P01` rule on it, commit only if it is valid. Nothing
 * here mutates a document in place, and nothing commits a candidate an authority
 * has not seen.
 *
 * ## Why `APP3-P02` is not asked
 *
 * None of the three changes geometry. A restack reorders the array, and z-order
 * affects neither an effective transform nor a bound — `IMP-D045` PO-08 says so
 * in terms ("z-order never affects bounds"). Hiding and locking flip a boolean
 * that PO-08 explicitly keeps out of geometry too: "hidden and locked serialized
 * elements still have geometry". So a containment or physical-size check here
 * would re-prove, every frame, a fact the operation cannot have changed —
 * `APP3-S04` §21 asks for the proof where a mutation *can* affect geometry, and
 * for no ritual where it cannot.
 *
 * P01 structural validation *is* asked, every time, because it is the thing that
 * can fail: it re-proves the group graph — single parent, no cycle, no unknown
 * child, depth within `IMP-D044`'s limit — against the reordered array.
 *
 * ## Nothing is sent
 *
 * No autosave, no timer, no saved indicator, no `publicDesignSessionAutosave`,
 * and no refetch of anything. A restack, a hide and a lock are edits to the
 * working document exactly as a transform is; `APP3-S10` owns persistence. The
 * network delta of every command here is zero.
 *
 * Each of the three does name itself to `APP3-S08` when it commits, and that is
 * still not a save: the entry is two in-memory documents and a bounded label,
 * held for this browser tab and this Session only.
 */
import { useCallback, useMemo, useState } from 'react';
import { validateDesignDocumentStructure, type DesignDocument } from '@embroidery/design-document';
import type { ElementGraph } from '@embroidery/design-engine';

import type { StudioHistoryAction } from '../model/studio-history';
import { STUDIO_LAYER_COPY } from '../model/studio-layer-copy';
import {
  layerRowsOf,
  withElementLocked,
  withElementMovedTo,
  withElementStepped,
  withElementVisible,
  type StudioLayerRow,
} from '../model/studio-layers';

export interface UseStudioLayersInput {
  readonly document: DesignDocument | null;
  /** The graph the scene already built. Never a second one built here. */
  readonly graph: ElementGraph | null;
  readonly selectedElementId: string | null;
  readonly commit: (document: DesignDocument, action: StudioHistoryAction) => void;
  readonly select: (elementId: string) => void;
  readonly clearSelection: () => void;
}

export interface UseStudioLayersResult {
  readonly rows: readonly StudioLayerRow[];
  /** The row currently being dragged, or `null`. Runtime only; never persisted. */
  readonly draggingId: string | null;
  /** The row a drop would land on, or `null`. Drives the drop indicator. */
  readonly dropTargetId: string | null;
  /** The last thing that happened, for a polite live region. */
  readonly announcement: string;
  readonly step: (elementId: string, direction: 'up' | 'down') => void;
  readonly setVisible: (elementId: string, visible: boolean) => void;
  readonly setLocked: (elementId: string, locked: boolean) => void;
  readonly startDrag: (elementId: string) => void;
  readonly dragOver: (elementId: string) => void;
  readonly drop: (elementId: string) => void;
  readonly endDrag: () => void;
  readonly select: (elementId: string) => void;
}

export function useStudioLayers({
  document,
  graph,
  selectedElementId,
  commit,
  select,
  clearSelection,
}: UseStudioLayersInput): UseStudioLayersResult {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const rows = useMemo(
    () => layerRowsOf(document, selectedElementId, graph),
    [document, graph, selectedElementId],
  );

  /**
   * Rules on a candidate and commits it, or says nothing changed.
   *
   * `null` in means the command was not available — a boundary, a nested row, an
   * id that is no longer there — and that is not a failure to announce: the
   * control that would have issued it is already disabled with a reason.
   */
  const apply = useCallback(
    (candidate: DesignDocument | null, spoken: string, action: StudioHistoryAction): boolean => {
      if (candidate === null) return false;
      const structure = validateDesignDocumentStructure(candidate);
      if (!structure.ok) {
        setAnnouncement(STUDIO_LAYER_COPY.refused);
        return false;
      }
      // One command, one entry (`APP3-S08` §12). A candidate the authority
      // refused never reaches here, so a refusal appends nothing.
      commit(structure.value, action);
      setAnnouncement(spoken);
      return true;
    },
    [commit],
  );

  const labelOf = useCallback(
    (elementId: string) => rows.find((row) => row.id === elementId)?.label ?? '',
    [rows],
  );

  const step = useCallback(
    (elementId: string, direction: 'up' | 'down') => {
      if (document === null) return;
      const label = labelOf(elementId);
      const spoken =
        direction === 'up' ? STUDIO_LAYER_COPY.movedUp(label) : STUDIO_LAYER_COPY.movedDown(label);
      apply(withElementStepped(document, elementId, direction, graph), spoken, {
        kind: 'reorder',
        label,
      });
    },
    [apply, document, graph, labelOf],
  );

  const setVisible = useCallback(
    (elementId: string, visible: boolean) => {
      if (document === null) return;
      const label = labelOf(elementId);
      const committed = apply(
        withElementVisible(document, elementId, visible),
        visible ? STUDIO_LAYER_COPY.shown(label) : STUDIO_LAYER_COPY.hidden(label),
        { kind: visible ? 'show' : 'hide', label },
      );
      // A hidden element is not selectable (`APP3-S02` §15), so a selection left
      // on one would be a selection the stage refuses to honour — and the
      // transform overlay would have to decide separately not to draw handles
      // for it. Clearing is the same rule the stage already applies, applied at
      // the moment the element stops qualifying.
      if (committed && !visible && elementId === selectedElementId) clearSelection();
    },
    [apply, clearSelection, document, labelOf, selectedElementId],
  );

  const setLocked = useCallback(
    (elementId: string, locked: boolean) => {
      if (document === null) return;
      const label = labelOf(elementId);
      // Locking does **not** deselect. A locked element is still a thing the
      // customer is looking at and still reports its size; what it refuses is
      // mutation, and the accepted editors already refuse it.
      apply(
        withElementLocked(document, elementId, locked),
        locked ? STUDIO_LAYER_COPY.locked(label) : STUDIO_LAYER_COPY.unlocked(label),
        { kind: locked ? 'lock' : 'unlock', label },
      );
    },
    [apply, document, labelOf],
  );

  const startDrag = useCallback((elementId: string) => {
    setDraggingId(elementId);
    setDropTargetId(null);
  }, []);

  const dragOver = useCallback(
    (elementId: string) => {
      setDropTargetId((current) => {
        // Not a drop target when it is the row being dragged, or when either end
        // is nested: a nested row's position is not a top-level stacking
        // decision, so the indicator must not offer one.
        const row = rows.find((candidate) => candidate.id === elementId);
        if (row === undefined || row.nested || elementId === draggingId) return null;
        return current === elementId ? current : elementId;
      });
    },
    [draggingId, rows],
  );

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  const drop = useCallback(
    (elementId: string) => {
      const moving = draggingId;
      endDrag();
      if (moving === null || document === null) return;
      const label = labelOf(moving);
      apply(
        withElementMovedTo(document, moving, elementId, graph),
        STUDIO_LAYER_COPY.moved(label),
        {
          kind: 'reorder',
          label,
        },
      );
    },
    [apply, document, draggingId, endDrag, graph, labelOf],
  );

  return {
    rows,
    draggingId,
    dropTargetId,
    announcement,
    step,
    setVisible,
    setLocked,
    startDrag,
    dragOver,
    drop,
    endDrag,
    select,
  };
}
