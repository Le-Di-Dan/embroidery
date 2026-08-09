'use client';

import { EditorDialog } from './editor-dialog';

interface EditorConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly testId: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The two confirmations that guard a discard: leaving the page with an unsaved
 * draft, and replacing a draft with the server's newer version.
 *
 * Both are the same interaction — *this action loses work you have not saved* —
 * so they share one component and differ only in copy. Cancel is the dismissal,
 * which is what `Escape` maps to: the safe answer is always "keep the draft".
 */
export function EditorConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  testId,
  onConfirm,
  onCancel,
}: EditorConfirmDialogProps) {
  return (
    <EditorDialog title={title} describedBy={`${testId}-body`} testId={testId} onDismiss={onCancel}>
      <p id={`${testId}-body`}>{body}</p>
      <div className="template-editor-dialog__actions">
        <button
          type="button"
          className="template-editor-dialog__secondary"
          data-testid={`${testId}-cancel`}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="template-editor-dialog__primary"
          data-testid={`${testId}-confirm`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </EditorDialog>
  );
}
