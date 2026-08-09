'use client';

import { LIFECYCLE_COPY } from '../model/lifecycle-copy';
import { LifecycleDialog } from './lifecycle-dialog';

interface LifecycleConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  /** An extra factual line, e.g. which version publication will freeze. */
  readonly note?: string;
  readonly confirmLabel: string;
  readonly testId: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The two reason-free confirmations: publish and unpublish.
 *
 * Both change what customers can see, which is why they are confirmed at all —
 * neither loses work, and both are reversible by the opposite command. Cancel is
 * the dismissal, so `Escape` always means "change nothing".
 */
export function LifecycleConfirmDialog({
  title,
  body,
  note,
  confirmLabel,
  testId,
  busy,
  onConfirm,
  onCancel,
}: LifecycleConfirmDialogProps) {
  return (
    <LifecycleDialog
      title={title}
      describedBy={`${testId}-body`}
      testId={testId}
      destructive={false}
      onDismiss={onCancel}
    >
      <p className="template-lifecycle-dialog__body" id={`${testId}-body`}>
        {body}
      </p>
      {note === undefined ? null : <p className="template-lifecycle-dialog__note">{note}</p>}
      <div className="template-lifecycle-dialog__actions">
        <button
          type="button"
          className="template-lifecycle-dialog__primary"
          data-testid={`${testId}-confirm`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? LIFECYCLE_COPY.outcome.working : confirmLabel}
        </button>
        <button
          type="button"
          className="template-lifecycle-dialog__secondary"
          data-testid={`${testId}-cancel`}
          disabled={busy}
          onClick={onCancel}
        >
          {LIFECYCLE_COPY.publishDialog.cancel}
        </button>
      </div>
    </LifecycleDialog>
  );
}
