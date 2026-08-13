'use client';

/**
 * Where the history panel goes on this viewport (`APP3-S08` §15).
 *
 * The same three compositions `APP3-S05-C1` established and `APP3-S04` and
 * `APP3-S06` reused, and deliberately the same *decision* rather than a fourth
 * one:
 *
 * - **desktop** — the 1440 presentation the two approved `APP3-S08` frames draw:
 *   the history panel beside the stage and, below it, the shortcut hint as its
 *   own box (`609:147` puts them at `y=120` and `y=444`).
 * - **tablet** — inside the accepted `618:140` right drawer, as one more section
 *   of the one inspector panel. The *controls* do not move into the drawer —
 *   `618:140`'s own callout keeps the left tool rail permanently visible, and
 *   `StudioHistoryRail` renders there at this tier too. What shares the drawer
 *   is the detail: the rows, the marker and the bound. A second drawer over the
 *   same stage edge would be the second drawer system the tablet composition
 *   exists to avoid.
 * - **mobile** — nothing here. `APP3-S11`'s bottom toolbar (`610:242`) carries
 *   `↶` and `↷`, driving this same controller, and the six approved mobile
 *   frames draw no history *list* — so there is none, rather than a panel
 *   invented to fill the tier. The sentence that used to stand here said 390 had
 *   no way to change the document at all, and it would now be false.
 *
 * The tier decides what is *rendered*, not what is visible. A CSS-hidden panel
 * is still focusable and its buttons still fire, so a media query would leave
 * two undo controls live at once.
 */
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { StudioHistoryList, type StudioHistoryListProps } from './studio-history-list';
import { StudioHistoryShortcuts } from './studio-history-shortcuts';

/**
 * Where in the stage frame this mount sits.
 *
 * `drawer` is not a slot in the frame at all — it is "inside the one inspector
 * drawer the tablet composition already has", which is why the tablet branch
 * renders for it rather than for `body`.
 */
export type StudioHistorySlot = 'drawer' | 'body';

export interface StudioHistoryPanelProps {
  readonly slot: StudioHistorySlot;
  readonly history: StudioHistoryListProps;
}

export function StudioHistoryPanel({ slot, history }: StudioHistoryPanelProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render, and the hydration pass that
  // matches it. Rendering the desktop panel into that HTML would put undo
  // controls on a phone until hydration replaced them.
  if (tier === null) return null;

  if (tier === 'tablet') {
    return slot === 'drawer' ? (
      <>
        <StudioHistoryList {...history} />
        <StudioHistoryShortcuts />
      </>
    ) : null;
  }
  if (slot === 'drawer') return null;

  // Nothing here at 390 any more: `APP3-S11`'s bottom toolbar carries undo and
  // redo (`610:242`), driving this same controller.
  if (tier === 'mobile') return null;

  return (
    <>
      <StudioHistoryList {...history} />
      <StudioHistoryShortcuts />
    </>
  );
}
