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
 * - **mobile** — nothing here. `APP3-S11` renders this same inspector at 390
 *   inside the approved text sheet `610:409`, reached from the toolbar's `T`.
 *   This mount is empty at that tier not because the tier cannot edit text, but
 *   because the surface that does it is somewhere else in the frame. Until S11
 *   shipped, a sentence stood here saying the tier could not; it would now be
 *   false, so it is gone rather than left standing.
 *
 * The tier decides what is *rendered*, not what is visible: a CSS-hidden field
 * is still focusable and still submits, so two tiers' worth of text controls
 * would both be reachable if this were a media query.
 *
 * ## Why there are two slots (`APP3-S05-MI01`)
 *
 * The compositions do not live in the same place in the frame. `APP3-D01-C1`
 * puts the tablet toggle in a topbar **above** the stage, while the accepted
 * desktop inspector sits below it. One mount point could only serve both by
 * reordering with CSS, which would leave the trigger visually above the stage
 * and late in the tab order — a defect, not a placement.
 *
 * So the screen mounts this twice, and each tier answers exactly one slot:
 * tablet fills `topbar` and leaves `body` empty; desktop and mobile do the
 * reverse. Nothing renders in both.
 */
import type { ReactNode } from 'react';

import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { StudioTextDrawer } from './studio-text-drawer';
import { StudioTextInspector, type StudioTextInspectorProps } from './studio-text-inspector';

/** Where in the stage frame this mount sits: above the stage, or below it. */
export type StudioTextSlot = 'topbar' | 'body';

export interface StudioTextPanelProps extends StudioTextInspectorProps {
  readonly slot: StudioTextSlot;
  /**
   * Further inspector sections for the **tablet** drawer only (`APP3-S06`).
   *
   * They reach the drawer through this mount because the drawer, its topbar and
   * its single trigger are one accepted composition (`APP3-S05-MI01`), and the
   * only way to add a section without adding a second trigger is to hand it to
   * the panel that owns the one there is. Every other tier ignores them: each
   * capability mounts its own desktop and mobile presentation, in its own slot.
   */
  readonly children?: ReactNode;
}

export function StudioTextPanel({ slot, children, ...props }: StudioTextPanelProps) {
  const tier = useStudioViewportTier();

  // No viewport observed yet — the server render, and the hydration pass that
  // matches it. Rendering the desktop inspector into that HTML would put real
  // text fields on a phone until hydration replaced them.
  if (tier === null) return null;

  // The tablet composition is the only one with anything above the stage, and
  // all of it is above the stage: the drawer is out of flow, so it follows its
  // own trigger in the DOM and still paints over the frame's right edge.
  if (tier === 'tablet')
    return slot === 'topbar' ? <StudioTextDrawer {...props}>{children}</StudioTextDrawer> : null;
  if (slot === 'topbar') return null;

  // Nothing here at 390 any more: `APP3-S11` renders this same inspector inside
  // the approved text sheet (`610:409`), reached from the toolbar's `T`. The
  // sentence that used to stand here said the tier could not edit text, and it
  // would now be false.
  if (tier === 'mobile') return null;

  return <StudioTextInspector {...props} />;
}
