'use client';

import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { GalleryDialog } from './gallery-dialog';

interface GalleryConflictDialogProps {
  readonly onReload: () => void;
  readonly onClose: () => void;
  /** True when reloading would discard the operator's own unsaved work. */
  readonly hasUnsavedChanges: boolean;
}

/**
 * The optimistic-concurrency conflict (`GALLERY_ENTRY_VERSION_CONFLICT`).
 *
 * There is no force-save and no "overwrite anyway": the server rejected the
 * write because someone else changed the entry, and offering to push through
 * would silently discard their change. Reload is the forward path, and it
 * refetches the authoritative record — including a fresh token, since retrying
 * with the stale one could only fail again.
 *
 * Reloading is not free when the operator has unsaved work, so the dialog says
 * so and keeps "Để sau" as a real option: the stale mutation is not replayed,
 * nothing on screen is discarded, and the operator decides. The explanation
 * never contains a timestamp, a token value or a request id — those are
 * transport facts, and what the operator needs to know is that someone else
 * edited it.
 */
export function GalleryConflictDialog({
  onReload,
  onClose,
  hasUnsavedChanges,
}: GalleryConflictDialogProps) {
  return (
    <GalleryDialog
      title={GALLERY_EDITOR_COPY.conflict.title}
      describedBy="gallery-conflict-body"
      role="alertdialog"
      onClose={onClose}
      testId="gallery-conflict-dialog"
      footer={
        <div className="gallery-dialog__actions">
          <button type="button" className="gallery-dialog__secondary" onClick={onClose}>
            {GALLERY_EDITOR_COPY.conflict.close}
          </button>
          <button
            type="button"
            className="gallery-dialog__primary"
            onClick={onReload}
            data-testid="gallery-conflict-reload"
          >
            {GALLERY_EDITOR_COPY.conflict.reload}
          </button>
        </div>
      }
    >
      <p className="gallery-dialog__body-text" id="gallery-conflict-body">
        {hasUnsavedChanges
          ? GALLERY_EDITOR_COPY.conflict.bodyWithChanges
          : GALLERY_EDITOR_COPY.conflict.body}
      </p>
    </GalleryDialog>
  );
}

interface GalleryUnsavedDialogProps {
  readonly onLeave: () => void;
  readonly onStay: () => void;
}

/**
 * The unsaved-change confirmation.
 *
 * Only ever rendered when a save would actually send something — authoring or
 * media — so an editor the operator merely looked at never blocks their exit.
 */
export function GalleryUnsavedDialog({ onLeave, onStay }: GalleryUnsavedDialogProps) {
  return (
    <GalleryDialog
      title={GALLERY_EDITOR_COPY.unsaved.title}
      describedBy="gallery-unsaved-body"
      role="alertdialog"
      onClose={onStay}
      testId="gallery-unsaved-dialog"
      footer={
        <div className="gallery-dialog__actions">
          <button type="button" className="gallery-dialog__secondary" onClick={onStay}>
            {GALLERY_EDITOR_COPY.unsaved.stay}
          </button>
          <button type="button" className="gallery-dialog__primary" onClick={onLeave}>
            {GALLERY_EDITOR_COPY.unsaved.leave}
          </button>
        </div>
      }
    >
      <p className="gallery-dialog__body-text" id="gallery-unsaved-body">
        {GALLERY_EDITOR_COPY.unsaved.body}
      </p>
    </GalleryDialog>
  );
}

interface GalleryUnpublishDialogProps {
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The unpublish confirmation (`870:1274`).
 *
 * An `alertdialog`, because it interrupts to prevent a consequential change:
 * the entry leaves public view. The body states what unpublishing actually does
 * — and, just as importantly, what it does not do. It is not deletion, and
 * nothing about the entry's images, description or SEO text is lost, which is
 * exactly the misreading a bare "are you sure?" invites.
 *
 * While the command is in flight the dialog stops being dismissible: it holds
 * the only indication of a request that has already left the browser.
 */
export function GalleryUnpublishDialog({
  pending,
  onConfirm,
  onCancel,
}: GalleryUnpublishDialogProps) {
  const copy = GALLERY_EDITOR_COPY.publication.confirmUnpublish;
  return (
    <GalleryDialog
      title={copy.title}
      describedBy="gallery-unpublish-body"
      role="alertdialog"
      dismissible={!pending}
      onClose={onCancel}
      testId="gallery-unpublish-dialog"
      footer={
        <div className="gallery-dialog__actions">
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={onCancel}
            disabled={pending}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="gallery-dialog__primary"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            data-testid="gallery-unpublish-confirm"
          >
            {pending ? GALLERY_EDITOR_COPY.publication.unpublishing : copy.confirm}
          </button>
        </div>
      }
    >
      <p className="gallery-dialog__body-text" id="gallery-unpublish-body">
        {copy.body}
      </p>
    </GalleryDialog>
  );
}
