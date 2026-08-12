'use client';

/**
 * The undo / redo controls and the history list (`609:147`, `609:209`).
 *
 * Exactly what the two approved frames draw — an undo control, a redo control,
 * their disabled state, the keyboard hints and a list of recent changes — and
 * nothing else.
 *
 * ## The list is informational
 *
 * There is no click-to-time-travel. `APP3-S08` §14 is explicit that the presence
 * of a list is not authority for arbitrary jumping, and the two frames name a
 * *mid-history* state and a *nothing-to-undo* state — both of which are exactly
 * what stepping with the two controls produces. Jumping to an arbitrary row is a
 * different interaction with different questions behind it (what happens to the
 * entries in between, what a customer expects the redo control to do afterwards),
 * and inventing an answer to those here would be a capability nobody approved.
 * So the rows are `<li>`s that say what happened and whether it is currently
 * applied, not buttons.
 *
 * ## Both controls are real buttons
 *
 * Disabled is `disabled`, not a click that silently does nothing, and each
 * disabled control says *why* in text a screen reader reaches — "nothing to undo
 * yet" is information, and a greyed rectangle is not.
 */
import { memo } from 'react';

import { STUDIO_HISTORY_COPY } from '../model/studio-history-copy';
import { MAX_HISTORY_ENTRIES, type StudioHistoryRow } from '../model/studio-history';

export interface StudioHistoryListProps {
  readonly rows: readonly StudioHistoryRow[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly announcement: string;
  readonly undo: () => void;
  readonly redo: () => void;
}

const UNDO_HINT_ID = 'studio-history-undo-hint';
const REDO_HINT_ID = 'studio-history-redo-hint';

/**
 * Memoized, because the screen above it re-renders on every pointer frame.
 *
 * A drag commits the working document sixty times a second and the whole stage
 * screen re-renders with it. None of that changes the history — the store holds
 * `history` still for the whole of a coalesced action — so without this the
 * panel would rebuild its rows inside the frame budget for a list that cannot
 * have moved. `useStudioHistory` keeps `rows` referentially stable for exactly
 * this; the two together are what keep undo off the measured path.
 */
export const StudioHistoryList = memo(function StudioHistoryList({
  rows,
  canUndo,
  canRedo,
  announcement,
  undo,
  redo,
}: StudioHistoryListProps) {
  return (
    <section className="studio-history" aria-label={STUDIO_HISTORY_COPY.panelLabel}>
      <h2 className="studio-history__heading">{STUDIO_HISTORY_COPY.title}</h2>

      <div
        className="studio-history__controls"
        role="group"
        aria-label={STUDIO_HISTORY_COPY.panelLabel}
        data-testid="studio-history-controls"
      >
        <button
          type="button"
          className="studio-history__control"
          data-testid="studio-history-undo"
          onClick={undo}
          disabled={!canUndo}
          aria-describedby={canUndo ? undefined : UNDO_HINT_ID}
        >
          {STUDIO_HISTORY_COPY.undo}
        </button>
        <button
          type="button"
          className="studio-history__control"
          data-testid="studio-history-redo"
          onClick={redo}
          disabled={!canRedo}
          aria-describedby={canRedo ? undefined : REDO_HINT_ID}
        >
          {STUDIO_HISTORY_COPY.redo}
        </button>
      </div>

      {canUndo ? null : (
        <p
          className="studio-history__reason"
          id={UNDO_HINT_ID}
          data-testid="studio-history-no-undo"
        >
          {STUDIO_HISTORY_COPY.undoUnavailable}
        </p>
      )}
      {canRedo ? null : (
        <p
          className="studio-history__reason"
          id={REDO_HINT_ID}
          data-testid="studio-history-no-redo"
        >
          {STUDIO_HISTORY_COPY.redoUnavailable}
        </p>
      )}

      {/* The shortcut hints, as readable text rather than as drawn glyphs, so
          they can be announced instead of only seen. */}
      <p className="studio-history__shortcuts" data-testid="studio-history-shortcuts">
        {STUDIO_HISTORY_COPY.shortcutHint}{' '}
        <span className="studio-history__key">{STUDIO_HISTORY_COPY.shortcutUndo}</span>{' '}
        <span className="studio-history__key">{STUDIO_HISTORY_COPY.shortcutRedo}</span>
      </p>

      {rows.length === 0 ? (
        <p className="studio-history__empty" data-testid="studio-history-empty" role="status">
          {STUDIO_HISTORY_COPY.empty}
          <span className="studio-history__hint">{STUDIO_HISTORY_COPY.emptyHint}</span>
        </p>
      ) : (
        <ol
          className="studio-history__list"
          aria-label={STUDIO_HISTORY_COPY.listLabel}
          data-testid="studio-history-list"
        >
          {rows.map((row) => (
            <li
              key={row.key}
              className={
                row.applied
                  ? 'studio-history__row'
                  : 'studio-history__row studio-history__row--undone'
              }
              data-testid="studio-history-row"
              data-applied={row.applied ? 'true' : 'false'}
            >
              <span className="studio-history__label">{row.label}</span>
              {/* State as text, never colour alone. */}
              <span className="studio-history__state">
                {row.applied ? STUDIO_HISTORY_COPY.appliedFlag : STUDIO_HISTORY_COPY.undoneFlag}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* The bound, said out loud rather than discovered when the oldest row
          disappears. `APP3-D01`'s directive for this section forbids implying an
          infinite history, and the number comes from the constant. */}
      <p className="studio-history__bound" data-testid="studio-history-bound">
        {STUDIO_HISTORY_COPY.boundNote(MAX_HISTORY_ENTRIES)}
      </p>

      <p className="studio-history__announcement" role="status" data-testid="studio-history-live">
        {announcement}
      </p>
    </section>
  );
});
