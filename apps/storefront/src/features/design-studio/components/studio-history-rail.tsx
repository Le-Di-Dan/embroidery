'use client';

/**
 * Undo and redo in the persistent left tool rail (`609:147`, `609:209`).
 *
 * ## What the live frames settled
 *
 * The delivered `APP3-S08` could not open its two nodes — the Figma connector
 * needs interactive OAuth — and placed the two controls in the history panel's
 * own header as a disclosed engineering placement. Human review opened the nodes
 * and the placement was wrong: both frames draw a **persistent left tool rail**
 * (`x=0 y=60 w=72 h=840`) carrying the text tool, the image tool, Undo at
 * `y=132` and Redo at `y=188`, with the history panel a separate surface on the
 * right. `618:140` proves the same rail persists at 1024 with 48×48 targets, and
 * says so in its own callout: *thanh công cụ trái giữ nguyên và luôn hiện*.
 *
 * So the controls live here, and the panel beside the stage carries no second
 * pair. Two controls for one command is how a customer ends up believing the two
 * do different things.
 *
 * ## Only the two this checkpoint owns
 *
 * The rail the frames draw also carries the text and image tools. Those are
 * `APP3-S05`'s and `APP3-S06`'s delivered and accepted surfaces, and moving them
 * would re-author two accepted checkpoints from a correction that owns neither.
 * The rail is introduced here with exactly the controls `APP3-S08` owns; the
 * tools joining it is a composition change for the checkpoint that owns them,
 * and is raised as a follow-up rather than taken silently.
 *
 * ## Nothing at 390
 *
 * `APP3-S11` owns the mobile toolbar the shortcut note delegates to, down to the
 * glyphs. Rendering a disabled version of it here would be that surface,
 * delivered early and merely inert.
 */
import { memo } from 'react';

import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { STUDIO_HISTORY_COPY } from '../model/studio-history-copy';

export interface StudioHistoryRailProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

const UNDO_HINT_ID = 'studio-history-undo-hint';
const REDO_HINT_ID = 'studio-history-redo-hint';

/**
 * Memoized for the same reason the list is: the screen above re-renders on every
 * pointer frame of a gesture, and the store holds `history` still for the whole
 * of a coalesced action, so neither control can have changed inside one.
 */
export const StudioHistoryRail = memo(function StudioHistoryRail({
  canUndo,
  canRedo,
  undo,
  redo,
}: StudioHistoryRailProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render and the hydration pass that
  // matches it. Rendering the rail into that HTML would put undo controls on a
  // phone until hydration removed them.
  if (tier === null || tier === 'mobile') return null;

  return (
    <div
      className="studio-history-rail"
      role="group"
      aria-label={STUDIO_HISTORY_COPY.panelLabel}
      data-testid="studio-history-rail"
    >
      <button
        type="button"
        className="studio-history-rail__control"
        data-testid="studio-history-undo"
        onClick={undo}
        disabled={!canUndo}
        aria-label={STUDIO_HISTORY_COPY.undo}
        aria-describedby={canUndo ? undefined : UNDO_HINT_ID}
      >
        {/* The glyph is decoration; the accessible name is the word. */}
        <span aria-hidden="true">↶</span>
      </button>
      <button
        type="button"
        className="studio-history-rail__control"
        data-testid="studio-history-redo"
        onClick={redo}
        disabled={!canRedo}
        aria-label={STUDIO_HISTORY_COPY.redo}
        aria-describedby={canRedo ? undefined : REDO_HINT_ID}
      >
        <span aria-hidden="true">↷</span>
      </button>

      {/*
        Why each control is off, reachable by a screen reader rather than only
        inferable from a greyed rectangle. Visually hidden because a 72px rail
        has no room for a sentence — never `display: none`, which would take the
        text out of the accessibility tree and leave `aria-describedby` pointing
        at nothing.
      */}
      {canUndo ? null : (
        <p
          className="studio-history-rail__reason"
          id={UNDO_HINT_ID}
          data-testid="studio-history-no-undo"
        >
          {STUDIO_HISTORY_COPY.undoUnavailable}
        </p>
      )}
      {canRedo ? null : (
        <p
          className="studio-history-rail__reason"
          id={REDO_HINT_ID}
          data-testid="studio-history-no-redo"
        >
          {STUDIO_HISTORY_COPY.redoUnavailable}
        </p>
      )}
    </div>
  );
});
