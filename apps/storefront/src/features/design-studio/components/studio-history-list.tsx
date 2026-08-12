'use client';

/**
 * The history panel (`609:147` at `x=990 y=120 w=400 h=300`, `609:209`).
 *
 * Exactly what the two approved frames draw in that box: a heading, the rows,
 * the marker on the row the design is currently at, and the bound. The controls
 * are **not** here — both frames put Undo and Redo in the persistent left tool
 * rail, and a second pair in this header would be two controls for one command.
 * The shortcut hint is not here either; `609:147` gives it its own box below.
 *
 * ## The baseline row, and why it is not an entry
 *
 * `609:209` is the *Nothing to Undo* state and its panel is not empty: it draws
 * one non-undoable row naming where the design came from, carrying the marker.
 * That is presentation. The engine still starts at `entries.length === 0` and
 * `cursor === 0`, undo is still disabled, and this row adds nothing to undo
 * depth — `historyRowsOf` projects it, and nothing can undo *into* it because
 * there is no entry behind it to reverse.
 *
 * ## The list is informational
 *
 * There is no click-to-time-travel. `APP3-S08` §14 is explicit that the presence
 * of a list is not authority for arbitrary jumping, and the two frames name a
 * *mid-history* state and a *nothing-to-undo* state — both of which are exactly
 * what stepping with the two rail controls produces. Jumping to an arbitrary row
 * is a different interaction with different questions behind it (what happens to
 * the entries in between, what a customer expects redo to do afterwards), and
 * inventing an answer to those here would be a capability nobody approved. So
 * the rows are `<li>`s, not buttons.
 *
 * ## Rows a redo would return to stay visible
 *
 * After an undo the rows past the marker remain in the list. They are what redo
 * comes back to, and hiding them would make the redo control point at nothing a
 * customer can see.
 */
import { memo } from 'react';

import { STUDIO_HISTORY_COPY } from '../model/studio-history-copy';
import { MAX_HISTORY_ENTRIES, type StudioHistoryRow } from '../model/studio-history';

export interface StudioHistoryListProps {
  readonly rows: readonly StudioHistoryRow[];
  readonly announcement: string;
}

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
  announcement,
}: StudioHistoryListProps) {
  return (
    <section className="studio-history" aria-label={STUDIO_HISTORY_COPY.panelLabel}>
      <h2 className="studio-history__heading">{STUDIO_HISTORY_COPY.title}</h2>

      <ol
        className="studio-history__list"
        aria-label={STUDIO_HISTORY_COPY.listLabel}
        data-testid="studio-history-list"
      >
        {rows.map((row) => (
          <li
            key={row.key}
            className={
              row.current
                ? 'studio-history__row studio-history__row--current'
                : 'studio-history__row'
            }
            data-testid={row.baseline ? 'studio-history-baseline' : 'studio-history-row'}
            data-current={row.current ? 'true' : 'false'}
            aria-current={row.current ? 'step' : undefined}
          >
            <span className="studio-history__label">{row.label}</span>
            {/* The position as text, never carried by colour alone. */}
            {row.current ? (
              <span className="studio-history__badge">{STUDIO_HISTORY_COPY.currentBadge}</span>
            ) : null}
          </li>
        ))}
      </ol>

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
