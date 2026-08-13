'use client';

/**
 * The whole 390 composition (`APP3-S11`) — the toolbar and the five sheets.
 *
 * Mounted by `StudioStageScreen` only when the tier is `mobile`, so nothing here
 * exists at 1024 or 1440 and there is no CSS-hidden mobile surface waiting to be
 * found by a keyboard on a desktop. The reverse holds too: the persistent left
 * rail and the tablet drawer already render nothing at this tier, so 390 ends
 * with exactly one topbar, one save chip, one stage and one toolbar.
 *
 * ## Every sheet is a projection
 *
 * Not one of the five owns a model. The text sheet renders `APP3-S05`'s
 * inspector, the image sheet renders `APP3-S06`'s, the layer sheet drives
 * `APP3-S04`'s controller, the transform sheet builds candidates for
 * `APP3-S03`/`APP3-P02` to rule on, and the conflict sheet renders `APP3-S10`'s
 * two actions. What this file owns is *where they appear on a phone*.
 *
 * ## The conflict sheet is not a second conflict surface
 *
 * `610:514` is the mobile placement of the decision `610:118` already defines,
 * so at this tier it replaces the region `StudioSaveState` would otherwise draw
 * rather than joining it — the screen passes `suppressConflict` for exactly that
 * reason. Two surfaces asking the same question, with the same two buttons, is
 * how a customer ends up believing they are two different questions.
 *
 * It cannot be dismissed. `APP3-S10` offers a conflict exactly two ways out and
 * neither is "later", so there is no close button and the scrim does not close
 * it.
 */
import { useState } from 'react';

import type { ElementGraph } from '@embroidery/design-engine';

import { useKeyboardInset } from '../hooks/use-keyboard-inset';
import type { UseStudioMobileSheetsResult } from '../hooks/use-studio-mobile-sheets';
import type { UseStudioAutosaveResult } from '../hooks/use-studio-autosave';
import type { UseStudioHistoryResult } from '../hooks/use-studio-history';
import type { UseStudioLayersResult } from '../hooks/use-studio-layers';
import { STUDIO_MOBILE_COPY } from '../model/studio-mobile-copy';
import { STUDIO_SAVE_COPY } from '../model/studio-autosave-copy';
import { textElementOf } from '../model/studio-text-fields';
import { StudioImageInspector, type StudioImageInspectorProps } from './studio-image-inspector';
import { StudioLayersSheet } from './studio-layers-sheet';
import { StudioMobileToolbar } from './studio-mobile-toolbar';
import { StudioSheet } from './studio-sheet';
import { StudioTextInspector, type StudioTextInspectorProps } from './studio-text-inspector';
import { StudioTransformSheet } from './studio-transform-sheet';

export interface StudioMobileSurfaceProps {
  /**
   * The document, selection, scope, limits and commit the sheets work on.
   *
   * One object rather than five props, and it is the **text inspector's** own
   * prop set because the two need exactly the same five facts: the sheet that
   * edits a text element and the sheet that resizes any element are both asking
   * "which document, which element, ruled against which placement". Passing them
   * separately would let the two sheets be given different answers.
   */
  readonly text: StudioTextInspectorProps;
  /** The graph the scene already resolved. Never a second one built here. */
  readonly graph: ElementGraph | null;
  readonly layers: UseStudioLayersResult;
  readonly image: StudioImageInspectorProps;
  readonly save: UseStudioAutosaveResult;
  /** `APP3-S08`'s one controller — the same one the rail and the panel drive. */
  readonly history: UseStudioHistoryResult;
  /**
   * Which sheet is open, owned by the screen.
   *
   * Above this component because the **transform** sheet is opened from the
   * selection's own handles, which the stage overlay draws — a state owned here
   * could not be reached from there without a second channel back up.
   */
  readonly sheets: UseStudioMobileSheetsResult;
}

export function StudioMobileSurface({
  text,
  graph,
  layers,
  image,
  save,
  history,
  sheets,
}: StudioMobileSurfaceProps) {
  const [refusal, setRefusal] = useState<string | null>(null);
  // Measured only while the text sheet is open: it is the only surface with a
  // field, and a `VisualViewport` listener bound for the whole session would
  // report a browser toolbar collapsing as a keyboard.
  const keyboardInsetPx = useKeyboardInset(sheets.open === 'text');

  const conflict = save.state === 'CONFLICT';
  const canEditText = textElementOf(text.document, text.elementId) !== undefined;

  return (
    <>
      <p className="studio-mobile-hint" data-testid="studio-mobile-hint">
        {STUDIO_MOBILE_COPY.gestureHint}
      </p>

      <StudioMobileToolbar
        canEditText={canEditText}
        canRedo={history.canRedo}
        canUndo={history.canUndo}
        onToggle={sheets.toggle}
        open={sheets.open}
        redo={history.redo}
        undo={history.undo}
      />

      {sheets.open === 'transform' ? (
        <StudioSheet
          onClose={sheets.close}
          testId="studio-mobile-transform-sheet"
          title={STUDIO_MOBILE_COPY.transform.title}
        >
          <StudioTransformSheet {...text} graph={graph} onRefusal={setRefusal} refusal={refusal} />
        </StudioSheet>
      ) : null}

      {sheets.open === 'layers' ? (
        <StudioSheet
          onClose={sheets.close}
          testId="studio-mobile-layers-sheet"
          title={STUDIO_MOBILE_COPY.layers.title}
        >
          <StudioLayersSheet layers={layers} />
        </StudioSheet>
      ) : null}

      {sheets.open === 'text' ? (
        <StudioSheet
          keyboardInsetPx={keyboardInsetPx}
          onClose={sheets.close}
          testId="studio-mobile-text-sheet"
          title={STUDIO_MOBILE_COPY.text_.title}
        >
          <StudioTextInspector {...text} />
          <p className="studio-sheet__note">{STUDIO_MOBILE_COPY.text_.keyboardNote}</p>
        </StudioSheet>
      ) : null}

      {sheets.open === 'image' ? (
        <StudioSheet
          onClose={sheets.close}
          testId="studio-mobile-image-sheet"
          title={STUDIO_MOBILE_COPY.image_.title}
        >
          <StudioImageInspector {...image} />
          <p className="studio-sheet__note">{STUDIO_MOBILE_COPY.image_.formats}</p>
          <p className="studio-sheet__note">{STUDIO_MOBILE_COPY.image_.privacy}</p>
        </StudioSheet>
      ) : null}

      {conflict ? (
        <StudioSheet
          dismissible={false}
          onClose={noop}
          testId="studio-mobile-conflict-sheet"
          title={STUDIO_MOBILE_COPY.conflict.title}
        >
          <p className="studio-sheet__body-text">{STUDIO_MOBILE_COPY.conflict.body}</p>
          <div className="studio-sheet__actions">
            <button
              className="studio-button studio-button--primary"
              data-testid="studio-mobile-load-latest"
              onClick={save.loadLatest}
              type="button"
            >
              {STUDIO_SAVE_COPY.conflictLoadLatest}
            </button>
            <button
              className="studio-button"
              data-testid="studio-mobile-keep-local"
              onClick={save.keepLocal}
              type="button"
            >
              {STUDIO_SAVE_COPY.conflictKeepLocal}
            </button>
          </div>
          {/* What each choice costs, before it is made — the same two sentences
              the desktop decision carries. */}
          <p className="studio-sheet__note">
            {STUDIO_SAVE_COPY.conflictLoadLatestNote} {STUDIO_SAVE_COPY.conflictKeepLocalNote}
          </p>
        </StudioSheet>
      ) : null}
    </>
  );
}

/** A sheet that may not be closed still needs a handler; this one does nothing. */
function noop() {
  /* intentionally empty */
}
