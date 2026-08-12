'use client';

/**
 * Where each capability panel mounts in the stage frame.
 *
 * Split out of `StudioStageScreen` at `APP3-S08`, when adding the fourth
 * capability panel took that file past the 400-line limit. It is a split by
 * *responsibility* rather than by line count: the screen decides what the
 * capabilities **are** — it owns their controllers, above the viewport tier, so
 * a breakpoint crossing cannot discard one — and this file decides where each
 * one is **mounted**. Nothing about the ownership moved.
 *
 * ## Two regions, and a panel renders in exactly one
 *
 * `APP3-S05-MI01` established the shape and every capability since has reused
 * it: the compositions do not live in the same place in the frame. The tablet
 * composition puts one topbar above the stage, holding one trigger and one
 * out-of-flow drawer; the desktop and mobile compositions put their panels below
 * it. One mount point could only serve both by reordering with CSS, which would
 * leave the trigger visually above the stage and late in the tab order.
 *
 * So the screen renders this twice, and each tier answers exactly one region.
 * Each panel decides for itself which — that decision is the panel's, not this
 * file's, and duplicating it here is how the two would drift apart.
 *
 * A fourth panel joining the tablet drawer is deliberate and not a new
 * decision: `APP3-D01-C1` says 1024 "cannot hold three regions", so a second
 * drawer over the same stage edge would be the second drawer system the tablet
 * composition exists to avoid.
 */
import type { UseStudioLayersResult } from '../hooks/use-studio-layers';
import { StudioHistoryPanel } from './studio-history-panel';
import type { StudioHistoryListProps } from './studio-history-list';
import { StudioImagePanel, type StudioImagePanelProps } from './studio-image-panel';
import { StudioLayersPanel } from './studio-layers-panel';
import { StudioTextPanel } from './studio-text-panel';
import type { StudioTextInspectorProps } from './studio-text-inspector';

/** Above the stage, or below it. */
export type StudioPanelRegion = 'topbar' | 'body';

export interface StudioStagePanelsProps {
  readonly region: StudioPanelRegion;
  readonly text: StudioTextInspectorProps;
  readonly image: Omit<StudioImagePanelProps, 'slot'>;
  readonly layers: UseStudioLayersResult;
  readonly history: StudioHistoryListProps;
}

export function StudioStagePanels({
  region,
  text,
  image,
  layers,
  history,
}: StudioStagePanelsProps) {
  if (region === 'topbar') {
    // The tablet composition is the only one with anything here, and the text
    // panel owns the one trigger — so every other section reaches the drawer
    // through it rather than by adding a second trigger of its own.
    return (
      <StudioTextPanel slot="topbar" {...text}>
        <StudioImagePanel slot="drawer" {...image} />
        <StudioLayersPanel slot="drawer" layers={layers} />
        <StudioHistoryPanel slot="drawer" history={history} />
      </StudioTextPanel>
    );
  }

  return (
    <>
      <StudioTextPanel slot="body" {...text} />
      <StudioImagePanel slot="body" {...image} />
      <StudioLayersPanel slot="body" layers={layers} />
      <StudioHistoryPanel slot="body" history={history} />
    </>
  );
}
