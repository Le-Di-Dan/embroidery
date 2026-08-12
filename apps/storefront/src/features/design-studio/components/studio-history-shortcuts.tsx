'use client';

/**
 * The keyboard hint block (`609:147`, `x=990 y=444 w=400 h=88`).
 *
 * A **separate** informational panel below the history panel, not a paragraph
 * inside it: the approved frame places it at its own y with its own box, and the
 * delivered `APP3-S08` folded it into the panel because it could not open the
 * node. It states facts and offers no control — there is nothing to press here,
 * and the two combinations it names are exactly the two
 * `use-studio-history-shortcuts` binds.
 *
 * The mobile line is the frame's own delegation to `APP3-S11`. It appears on the
 * surfaces that have a keyboard, telling a customer where the controls are on a
 * phone; 390 renders no history surface at all, so it is never shown *instead*
 * of one.
 */
import { memo } from 'react';

import { STUDIO_HISTORY_COPY } from '../model/studio-history-copy';

export const StudioHistoryShortcuts = memo(function StudioHistoryShortcuts() {
  return (
    <section
      className="studio-history-shortcuts"
      aria-label={STUDIO_HISTORY_COPY.shortcutHeading}
      data-testid="studio-history-shortcuts"
    >
      <h3 className="studio-history-shortcuts__heading">{STUDIO_HISTORY_COPY.shortcutHeading}</h3>
      <p className="studio-history-shortcuts__keys">
        <span className="studio-history-shortcuts__key">{STUDIO_HISTORY_COPY.shortcutUndo}</span>{' '}
        <span aria-hidden="true">{STUDIO_HISTORY_COPY.shortcutSeparator}</span>{' '}
        <span className="studio-history-shortcuts__key">{STUDIO_HISTORY_COPY.shortcutRedo}</span>
      </p>
      <p className="studio-history-shortcuts__mobile" data-testid="studio-history-mobile-note">
        {STUDIO_HISTORY_COPY.mobileDelegation}
      </p>
    </section>
  );
});
