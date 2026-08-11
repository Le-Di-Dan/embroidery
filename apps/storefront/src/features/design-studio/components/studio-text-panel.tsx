'use client';

/**
 * Where the text inspector goes on this viewport (`APP3-S05-C1`).
 *
 * One decision, in one place, because `APP3-D01-C1` draws three compositions
 * rather than one that reflows:
 *
 * - **desktop** — the accepted 1440 presentation, in flow beside the stage.
 *   Unchanged by this correction.
 * - **tablet** — the `618:140` right drawer, toggled from the topbar.
 * - **mobile** — nothing editable at all. The Studio's mobile editing surfaces,
 *   the text bottom sheet among them, belong to `APP3-S11`; a desktop panel
 *   allowed to stack under a 390 stage would be that checkpoint's capability
 *   delivered early and unreviewed. What remains is a sentence saying so, and
 *   only when there is a text element it would otherwise be about.
 *
 * The tier decides what is *rendered*, not what is visible: a CSS-hidden field
 * is still focusable and still submits, so hiding one would leave the S11
 * surface in place and merely out of sight.
 */
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { STUDIO_TEXT_COPY } from '../model/studio-text-copy';
import { textElementOf } from '../model/studio-text-fields';
import { StudioTextDrawer } from './studio-text-drawer';
import { StudioTextInspector, type StudioTextInspectorProps } from './studio-text-inspector';

export function StudioTextPanel(props: StudioTextInspectorProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render, and the hydration pass that
  // matches it. Rendering the desktop inspector into that HTML would put real
  // text fields on a phone until hydration replaced them.
  if (tier === null) return null;

  if (tier === 'mobile') {
    if (textElementOf(props.document, props.elementId) === undefined) return null;
    return (
      <p className="studio-text__unavailable" data-testid="studio-text-mobile-notice" role="status">
        {STUDIO_TEXT_COPY.mobileUnavailable}
      </p>
    );
  }

  if (tier === 'tablet') return <StudioTextDrawer {...props} />;

  return <StudioTextInspector {...props} />;
}
