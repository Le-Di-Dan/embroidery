'use client';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import { EditorDialog } from './editor-dialog';

interface EditorConflictDialogProps {
  readonly onReload: () => void;
  readonly onKeepLocal: () => void;
}

/**
 * The stale-version conflict (`601:147`).
 *
 * `APP3-D01` §I.3 makes this a design decision rather than a wording choice:
 * *conflict is a decision, never a merge*. So the dialog does four things and
 * refuses a fifth.
 *
 * It states that **the server was not overwritten** — the sentence the whole
 * screen exists to make true. `APP3-B03A`'s compare-and-set failed, so nothing
 * was written, and an operator who believed otherwise would go looking for
 * changes that were never made.
 *
 * It offers **exactly two** choices, and says what each costs. Reloading
 * replaces the local draft; keeping it keeps it in this browser only, where it
 * is not backed up by anything.
 *
 * It says there is **no automatic merge**, because there is not one — no
 * three-way diff, no field-level reconciliation, no last-write-wins.
 *
 * And it offers no force-save and no dismissal. There is no third button that
 * writes anyway, and no `Escape`: closing without choosing would leave a draft
 * that cannot be saved and no statement of why.
 */
export function EditorConflictDialog({ onReload, onKeepLocal }: EditorConflictDialogProps) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.conflict;

  return (
    <EditorDialog
      title={copy.title}
      describedBy="editor-conflict-body"
      testId="editor-conflict-dialog"
      onDismiss={null}
    >
      <div id="editor-conflict-body">
        <p className="template-editor-dialog__lead" data-testid="editor-conflict-not-overwritten">
          {copy.notOverwritten}
        </p>
        <p>{copy.body}</p>
        <p>{copy.noMerge}</p>
      </div>

      <div className="template-editor-dialog__actions">
        <button
          type="button"
          className="template-editor-dialog__primary"
          data-testid="editor-conflict-reload"
          onClick={onReload}
        >
          {copy.reload}
        </button>
        <button
          type="button"
          className="template-editor-dialog__secondary"
          data-testid="editor-conflict-keep-local"
          onClick={onKeepLocal}
        >
          {copy.keepLocal}
        </button>
      </div>

      <p className="template-editor-dialog__help">{copy.reloadHelp}</p>
      <p className="template-editor-dialog__help">{copy.keepLocalHelp}</p>
    </EditorDialog>
  );
}
