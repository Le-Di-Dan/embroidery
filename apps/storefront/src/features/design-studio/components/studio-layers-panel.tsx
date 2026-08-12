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
 * - **mobile** — nothing that edits. The mobile layer bottom sheet is
 *   `APP3-S11`'s, and shipping a drag-reorder list at 390 would be that
 *   checkpoint's capability delivered early and unreviewed.
 *
 * The tier decides what is *rendered*, not what is visible. A CSS-hidden list is
 * still focusable and its buttons still fire, so hiding one would leave the S11
 * surface in place and merely out of sight.
 */
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { STUDIO_LAYER_COPY } from '../model/studio-layer-copy';
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

  if (tier === 'mobile') {
    return (
      <p
        className="studio-layers__unavailable"
        data-testid="studio-layers-mobile-notice"
        role="status"
      >
        {STUDIO_LAYER_COPY.mobileUnavailable}
      </p>
    );
  }

  return <StudioLayersList {...props} />;
}
