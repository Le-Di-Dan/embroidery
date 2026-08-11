'use client';

/**
 * Where the image inspector goes on this viewport (`APP3-S06` §7).
 *
 * The same three compositions `APP3-S05-C1` established, and deliberately the
 * same *decision*, not a second one:
 *
 * - **desktop** — the 1440 presentation, in flow beside the stage.
 * - **tablet** — inside the accepted `618:140` right drawer, as a section of the
 *   one inspector panel. The drawer, its topbar and its single trigger are
 *   `APP3-S05-MI01`'s and are reused rather than duplicated; a second toggle
 *   opening a second panel over the same stage edge would be the second drawer
 *   system the tablet composition exists to avoid.
 * - **mobile** — nothing that edits. Mobile image tooling — the bottom sheet
 *   `FIG-STUDIO-MOBILE-IMAGESHEET` draws and the touch surfaces around it —
 *   belongs to `APP3-S11`, and shipping a file picker at 390 would be that
 *   checkpoint's capability delivered early and unreviewed.
 *
 * The tier decides what is *rendered*, not what is visible. A CSS-hidden file
 * input is still focusable and still opens a picker, so hiding one would leave
 * the S11 surface in place and merely out of sight.
 *
 * At mobile what remains is a sentence saying so, and it promises nothing: no
 * "sắp có", no disabled control implying a button that will work later.
 *
 * ## The controller is owned above this switch
 *
 * The tier decides which mount renders, so crossing a breakpoint unmounts one
 * and mounts the other. An upload controller owned by the inspector went with
 * it — taking the Session revision the last upload returned — and the next
 * upload was refused `409 CONFLICT` against a revision the Session had already
 * moved past. A real browser found that. The controller now lives in
 * `StudioStageScreen`, above every tier, and arrives here as a prop.
 */
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { STUDIO_IMAGE_COPY } from '../model/studio-image-copy';
import { StudioImageInspector, type StudioImageInspectorProps } from './studio-image-inspector';

/**
 * Where in the stage frame this mount sits.
 *
 * `drawer` is not a slot in the frame at all — it is "inside the one inspector
 * drawer the tablet composition already has", which is why the tablet branch
 * renders for it rather than for `topbar`.
 */
export type StudioImageSlot = 'drawer' | 'body';

export interface StudioImagePanelProps extends StudioImageInspectorProps {
  readonly slot: StudioImageSlot;
}

export function StudioImagePanel({ slot, ...props }: StudioImagePanelProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render, and the hydration pass that
  // matches it. Rendering the desktop inspector into that HTML would put a real
  // file picker on a phone until hydration replaced it.
  if (tier === null) return null;

  if (tier === 'tablet') return slot === 'drawer' ? <StudioImageInspector {...props} /> : null;
  if (slot === 'drawer') return null;

  if (tier === 'mobile') {
    return (
      <p
        className="studio-image__unavailable"
        data-testid="studio-image-mobile-notice"
        role="status"
      >
        {STUDIO_IMAGE_COPY.mobileUnavailable}
      </p>
    );
  }

  return <StudioImageInspector {...props} />;
}
