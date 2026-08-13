'use client';

/**
 * Where the layer panel goes on this viewport (`APP3-S04` §5).
 *
 * The same three compositions `APP3-S05-C1` established and `APP3-S06` reused,
 * and deliberately the same *decision* rather than a third one:
 *
 * - **desktop** — the 1440 presentation the three approved `APP3-S04` frames
 *   draw, in flow beside the stage.
 * - **tablet** — inside the accepted `618:140` right drawer, as one more section
 *   of the one inspector panel. `APP3-D01-C1` anticipated exactly this in words:
 *   "layers merge into that same drawer because 1024 cannot hold three regions".
 *   So there is still one topbar, one trigger and one out-of-flow panel; a
 *   second drawer over the same stage edge would be the second drawer system the
 *   tablet composition exists to avoid.
 * - **mobile** — nothing here. `APP3-S11` drives this same controller at 390
 *   from the approved layer sheet `610:353`, whose rows carry the `⋮⋮` handle
 *   that frame draws. This mount is empty at that tier because the surface that
 *   does the work is somewhere else in the frame; the sentence that used to
 *   stand here said 390 could not reorder layers, and it would now be false.
 *
 * The tier decides what is *rendered*, not what is visible. A CSS-hidden list is
 * still focusable and its buttons still fire, so a media query would leave two
 * reorder surfaces live at once.
 */
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { StudioLayersList, type StudioLayersListProps } from './studio-layers-list';

/**
 * Where in the stage frame this mount sits.
 *
 * `drawer` is not a slot in the frame at all — it is "inside the one inspector
 * drawer the tablet composition already has", which is why the tablet branch
 * renders for it rather than for `body`.
 */
export type StudioLayersSlot = 'drawer' | 'body';

export interface StudioLayersPanelProps extends StudioLayersListProps {
  readonly slot: StudioLayersSlot;
}

export function StudioLayersPanel({ slot, ...props }: StudioLayersPanelProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render, and the hydration pass that
  // matches it. Rendering the desktop list into that HTML would put a draggable
  // reorder surface on a phone until hydration replaced it.
  if (tier === null) return null;

  if (tier === 'tablet') return slot === 'drawer' ? <StudioLayersList {...props} /> : null;
  if (slot === 'drawer') return null;

  // Nothing here at 390 any more: `APP3-S11` renders the approved layer sheet
  // (`610:353`) from the bottom toolbar, so the sentence that said the tier could
  // not do this would now be false.
  if (tier === 'mobile') return null;

  return <StudioLayersList {...props} />;
}
