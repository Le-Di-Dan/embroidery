'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import { PlacementDialog } from './placement-dialog';

interface PlacementConflictDialogProps {
  readonly reloading: boolean;
  readonly onReload: () => void;
  readonly onKeepDraft: () => void;
}

/**
 * The stale-token conflict (`596:7`, validation/conflict state).
 *
 * Opened only for `PLACEMENT_VERSION_CONFLICT` — the classification in
 * `placement-failure.ts` is the single gate, because reloading discards the
 * operator's unsaved tree and must never be offered for a failure reloading
 * cannot fix.
 *
 * Two choices, no automatic merge. Merging two placement trees would have to
 * decide which side of a code collision wins and which geometry is
 * authoritative, and getting that wrong writes a wrong physical size onto a
 * garment. The dialog says plainly that the server was **not** overwritten, and
 * that keeping the local draft keeps it in this browser only.
 *
 * Not dismissible. There is no safe default outcome here, so an Escape keypress
 * must not resolve it by reflex — the operator has to choose.
 */
export function PlacementConflictDialog({
  reloading,
  onReload,
  onKeepDraft,
}: PlacementConflictDialogProps) {
  return (
    <PlacementDialog
      title={PLACEMENT_COPY.conflict.title}
      describedBy="placement-conflict-body"
      role="alertdialog"
      dismissible={false}
      onClose={onKeepDraft}
      footer={
        <div className="placement-dialog__actions">
          <button
            type="button"
            className="placement-dialog__secondary"
            onClick={onKeepDraft}
            disabled={reloading}
          >
            {PLACEMENT_COPY.conflict.keep}
          </button>
          <button
            type="button"
            className="placement-dialog__primary"
            onClick={onReload}
            disabled={reloading}
            aria-busy={reloading}
            data-testid="placement-conflict-reload"
          >
            {PLACEMENT_COPY.conflict.reload}
          </button>
        </div>
      }
    >
      <div id="placement-conflict-body">
        <p className="placement-dialog__text">{PLACEMENT_COPY.conflict.body}</p>
        <p className="placement-dialog__note">{PLACEMENT_COPY.conflict.keepNote}</p>
      </div>
    </PlacementDialog>
  );
}
