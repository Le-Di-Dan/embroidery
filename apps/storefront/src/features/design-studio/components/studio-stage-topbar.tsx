'use client';

/**
 * The one Studio topbar (`APP3-S10`, reconciling `APP3-S05-MI01`).
 *
 * ## Why it moved here, and why that is not a redesign
 *
 * `APP3-S05-MI01` established the topbar as a real first child of the stage
 * frame — the control region **above** the stage that `APP3-D01-C1` draws — and
 * `APP3-S05-C1` implemented it *inside* the tablet text drawer, because at the
 * time the drawer's trigger was the only thing that lived there. `APP3-S10` adds
 * the save chip, which belongs in that same region at **every** tier, and a
 * topbar that only exists at 1024 cannot hold it.
 *
 * So the region became its own component and the drawer kept its trigger. That
 * is a relocation of one wrapper element, not a new topbar: there is still
 * exactly one `.studio-stage__topbar`, still one trigger inside it, and the
 * trigger's markup, state, label and behaviour are untouched. The alternative —
 * a second bar carrying the chip — is the thing `618:140` and every checkpoint
 * since have been shaped to avoid.
 *
 * The drawer panel itself travels with its trigger and stays absolutely
 * positioned against the stage frame, so opening it still changes no in-flow box
 * and the stage's geometry is byte-identical open or closed.
 */
import type { ReactNode } from 'react';

import type { UseStudioAutosaveResult } from '../hooks/use-studio-autosave';
import { StudioSaveChip } from './studio-save-chip';

export interface StudioStageTopbarProps {
  readonly save: UseStudioAutosaveResult;
  /** Whatever the current tier puts here — at 1024, the one drawer trigger. */
  readonly children?: ReactNode;
}

export function StudioStageTopbar({ save, children }: StudioStageTopbarProps) {
  return (
    <div className="studio-stage__topbar" data-testid="studio-stage-topbar">
      <StudioSaveChip failure={save.failure} lastSavedAt={save.lastSavedAt} state={save.state} />
      {children}
    </div>
  );
}
