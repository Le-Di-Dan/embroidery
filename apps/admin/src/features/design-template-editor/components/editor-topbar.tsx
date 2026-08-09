'use client';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { SaveChip } from '../model/editor-state';

interface EditorTopbarProps {
  readonly name: string;
  readonly status: string;
  readonly chip: SaveChip;
  readonly currentVersion: number | null;
  readonly canSave: boolean;
  readonly editable: boolean;
  readonly onSave: () => void;
  readonly onBack: () => void;
  /**
   * Navigate to the lifecycle screen (`APP3-A04`).
   *
   * A **navigation** affordance and nothing else. The four LC-24 commands stay
   * off this screen entirely: the editor's job is a document, and a publish
   * control beside an unsaved draft invites publishing the version that is not
   * on screen. It routes through the same guard the back link does, so leaving a
   * dirty editor for publication still asks.
   */
  readonly onManagePublication: () => void;
}

/**
 * The editor topbar: identity, status, the save-state chip and the save
 * (`601:3`, `601:100`).
 *
 * The chip carries **text**, not only a colour. `APP3-A03` §32 requires status
 * not to be colour-only, and the four states are genuinely different claims —
 * "unsaved" and "conflict" both mean *not saved*, but only one of them means the
 * save button will refuse.
 *
 * The version is reported from the server's answer and nothing else. Nothing
 * here adds one to the current version in anticipation of a save: the server
 * derives the next number, and a pre-incremented label would be a claim the
 * screen had no basis for and would be wrong the moment a save failed.
 *
 * `role="status"` with `aria-live="polite"`, so a save announces itself without
 * interrupting an operator mid-edit.
 */
export function EditorTopbar({
  name,
  status,
  chip,
  currentVersion,
  canSave,
  editable,
  onSave,
  onBack,
  onManagePublication,
}: EditorTopbarProps) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY;

  return (
    <header className="template-editor-topbar">
      <div className="template-editor-topbar__identity">
        <button
          type="button"
          className="template-editor-topbar__back"
          data-testid="editor-back"
          onClick={onBack}
        >
          {copy.page.backToList}
        </button>
        <h1 className="template-editor-topbar__name" data-testid="editor-template-name">
          {name}
        </h1>
        <span className="template-editor-topbar__status" data-testid="editor-template-status">
          {status}
        </span>
      </div>

      <div className="template-editor-topbar__state">
        <span className="template-editor-topbar__version" data-testid="editor-current-version">
          {currentVersion === null ? copy.version.none : copy.version.current(currentVersion)}
        </span>

        <span
          className="template-editor-topbar__chip"
          data-chip={chip}
          role="status"
          aria-live="polite"
          data-testid="editor-save-chip"
        >
          {chipLabel(chip)}
        </span>

        <button
          type="button"
          className="template-editor-topbar__publication"
          data-testid="editor-manage-publication"
          onClick={onManagePublication}
        >
          {copy.page.managePublication}
        </button>

        {editable ? (
          <button
            type="button"
            className="template-editor-topbar__save"
            disabled={!canSave}
            aria-busy={chip === 'saving'}
            data-testid="editor-save"
            onClick={onSave}
          >
            {chip === 'saving' ? copy.save.chipSaving : copy.save.action}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function chipLabel(chip: SaveChip): string {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.save;
  switch (chip) {
    case 'saving':
      return copy.chipSaving;
    case 'conflict':
      return copy.chipConflict;
    case 'unsaved':
      return copy.chipUnsaved;
    default:
      return copy.chipSaved;
  }
}
