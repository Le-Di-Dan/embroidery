'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import type { PlacementSaveFailure } from '../model/placement-failure';

interface PlacementSaveBarProps {
  readonly dirty: boolean;
  readonly invalid: boolean;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly conflicted: boolean;
  readonly failure: PlacementSaveFailure | null;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}

/**
 * The save state and the one command this screen issues (`596:7`, save bar).
 *
 * Saving is blocked while the draft is knowingly invalid. The block is a
 * disabled control *plus* a stated reason — a disabled button with no
 * explanation is indistinguishable from a broken one — and the reason names the
 * fields rather than the server, because at this point the server has not been
 * asked.
 *
 * A conflict also blocks saving. The draft's `expectedUpdatedAt` is known
 * stale, so pressing save could only produce the same `409` again; the operator
 * has to reload first, which is what the banner says.
 *
 * Every failure message is chosen from the classification, never echoed from
 * the response. The generic and network messages both promise that local edits
 * survive, because that is the property the operator most needs to trust.
 */
export function PlacementSaveBar({
  dirty,
  invalid,
  saving,
  saved,
  conflicted,
  failure,
  onSave,
  onDiscard,
}: PlacementSaveBarProps) {
  const blocked = invalid || conflicted;

  return (
    <div className="placement-save-bar">
      <div className="placement-save-bar__state">
        <p className="placement-save-bar__status" role="status">
          {statusText({ dirty, saving, saved })}
        </p>
        {invalid ? (
          <p className="placement-save-bar__invalid" role="alert">
            {PLACEMENT_COPY.validation.summaryTitle}. {PLACEMENT_COPY.validation.summaryBody}
          </p>
        ) : null}
        {conflicted ? (
          <p className="placement-save-bar__conflict" role="alert">
            {PLACEMENT_COPY.conflict.banner}
          </p>
        ) : null}
        {failure === null ? null : <FailureMessage failure={failure} />}
      </div>

      <div className="placement-save-bar__actions">
        <button
          type="button"
          className="placement-save-bar__secondary"
          disabled={!dirty || saving}
          onClick={onDiscard}
        >
          {PLACEMENT_COPY.save.discard}
        </button>
        <button
          type="button"
          className="placement-save-bar__primary"
          disabled={!dirty || blocked || saving}
          aria-busy={saving}
          data-testid="placement-save"
          onClick={onSave}
        >
          {saving ? PLACEMENT_COPY.save.saving : PLACEMENT_COPY.save.action}
        </button>
      </div>
    </div>
  );
}

function statusText(state: {
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saved: boolean;
}): string {
  if (state.saving) return PLACEMENT_COPY.save.saving;
  if (state.dirty) return PLACEMENT_COPY.save.unsaved;
  if (state.saved) return PLACEMENT_COPY.save.saved;
  return PLACEMENT_COPY.save.clean;
}

/**
 * The approved message for each classification.
 *
 * `version-conflict` is absent on purpose: it is presented by the dialog and
 * the banner, and repeating it here would give the operator a third place to
 * read the same thing and no additional way to act on it.
 */
function FailureMessage({ failure }: { readonly failure: PlacementSaveFailure }) {
  const copy = PLACEMENT_COPY.failure;
  const message = {
    'referenced-immutable': { title: copy.immutableTitle, body: copy.immutableBody },
    geometry: { title: copy.geometryTitle, body: copy.geometryBody },
    background: { title: copy.backgroundTitle, body: copy.backgroundBody },
    invalid: { title: copy.invalidTitle, body: copy.invalidBody },
    generic: { title: copy.genericTitle, body: copy.genericBody },
    'version-conflict': null,
  }[failure];

  if (message === null) return null;

  return (
    <div className="placement-save-bar__failure" role="alert">
      <p className="placement-save-bar__failure-title">{message.title}</p>
      <p className="placement-save-bar__failure-body">{message.body}</p>
    </div>
  );
}
