'use client';

/**
 * The text inspector (`APP3-S05`, `608:176` / `608:231` / `608:286`).
 *
 * It decides one thing before anything else: whether this selection may be
 * edited at all. Four answers, each a different fact and each stated —
 * "no selection", "not a text element", "hidden", "locked" — because a panel
 * that simply appeared empty would read as a bug, and one that appeared editable
 * over a locked element would promise a write `APP3-S02` and `APP3-S04` do not
 * allow.
 *
 * Selection is still `APP3-S02`'s and lock/hide *control* is still `APP3-S04`'s.
 * This panel reads both and offers neither.
 *
 * Nothing here saves. There is no autosave, no revision, no saved/saving badge
 * and no history: `APP3-S10` and `APP3-S08` own those, and a text edit changes
 * the in-memory working document and nothing else.
 */
import type { DesignDocument, TextElement } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import { useControlledFont } from '../hooks/use-controlled-font';
import { useStudioText } from '../hooks/use-studio-text';
import type { StudioHistoryAction } from '../model/studio-history';
import type { TextRefusal } from '../model/studio-text-authority';
import { STUDIO_TEXT_COPY } from '../model/studio-text-copy';
import { textElementOf } from '../model/studio-text-fields';
import type { StudioAreaLimits } from '../model/studio-transform-authority';
import { StudioTextControls } from './studio-text-controls';

export interface StudioTextInspectorProps {
  /** The working document the scene was built from. The only editable truth. */
  readonly document: DesignDocument | null;
  readonly elementId: string | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  readonly commit: (document: DesignDocument, action: StudioHistoryAction) => void;
}

const REFUSAL_IDS = 'studio-text-refusal';
const FONT_STATUS_ID = 'studio-text-font-status';

export function StudioTextInspector({
  document,
  elementId,
  scope,
  limits,
  commit,
}: StudioTextInspectorProps) {
  const element = textElementOf(document, elementId);
  const editable = element !== undefined && element.visible && !element.locked;

  // Both hooks run on every render, whatever the selection is. A hook called
  // only when something is editable would be a conditional hook, and the font
  // question is worth answering before the customer selects anything.
  //
  // The *exact* variant the selected element names, not its family
  // (`APP3-S05-C1`): a Session that opens on italic 700 asks for italic 700,
  // and does not inherit readiness from an upright face another element loaded.
  const fontState = useControlledFont(
    element === undefined
      ? null
      : {
          fontId: element.fontId,
          fontStyle: element.fontStyle,
          fontWeight: element.fontWeight,
        },
  );
  const text = useStudioText({ document, elementId, scope, limits, commit });
  // One "loading": the element's own face on arrival, and the face a pending
  // choice is waiting on. They are the same fact to a customer.
  const loading = text.pendingVariant || fontState === 'loading';

  return (
    <section className="studio-text" aria-label={STUDIO_TEXT_COPY.panelLabel}>
      <h2 className="studio-text__heading">{STUDIO_TEXT_COPY.panelLabel}</h2>

      {editable ? (
        <StudioTextControls
          describedBy={text.refusal === null ? undefined : REFUSAL_IDS}
          draft={text.draft}
          element={element}
          onBeginEdit={text.beginEdit}
          onChangeText={text.changeText}
          onEndEdit={text.endEdit}
          onFinishText={text.finishText}
          onPatch={text.applyPatch}
          onStartComposition={text.startComposition}
        />
      ) : (
        <p className="studio-text__unavailable" data-testid="studio-text-unavailable" role="status">
          {unavailableCopy(elementId, element)}
        </p>
      )}

      {/*
        The controlled font's state, and only when it is worth saying. "Loading"
        is polite; "unavailable" is an alert, because from that moment the glyph
        shapes on the stage are not the ones the design will be stitched with.
      */}
      {loading && element !== undefined ? (
        <p
          className="studio-text__font-status"
          data-testid="studio-text-font-loading"
          id={FONT_STATUS_ID}
          role="status"
        >
          {STUDIO_TEXT_COPY.fontLoading}
        </p>
      ) : null}
      {!loading && fontState === 'unavailable' && element !== undefined ? (
        <p
          className="studio-text__font-status studio-text__font-status--failed"
          data-testid="studio-text-font-unavailable"
          id={FONT_STATUS_ID}
          role="alert"
        >
          {STUDIO_TEXT_COPY.fontUnavailable}
        </p>
      ) : null}

      {text.refusal === null ? null : (
        <p
          className="studio-text__refusal"
          data-testid="studio-text-refusal"
          id={REFUSAL_IDS}
          role="alert"
        >
          {refusalCopy(text.refusal)}
        </p>
      )}
    </section>
  );
}

/**
 * Why this selection cannot be edited, in the customer's terms.
 *
 * The order matters: an element that is both hidden and locked is reported as
 * hidden, because that is the one the customer has to undo first to see what
 * they would be editing.
 */
function unavailableCopy(elementId: string | null, element: TextElement | undefined): string {
  if (elementId === null) return STUDIO_TEXT_COPY.noSelection;
  if (element === undefined) return STUDIO_TEXT_COPY.notText;
  if (!element.visible) return STUDIO_TEXT_COPY.hiddenElement;
  return STUDIO_TEXT_COPY.lockedElement;
}

function refusalCopy(refusal: TextRefusal): string {
  switch (refusal) {
    case 'text-too-long':
      return STUDIO_TEXT_COPY.refusalTextTooLong;
    case 'document-text-limit':
      return STUDIO_TEXT_COPY.refusalDocumentTextLimit;
    case 'invalid-text':
      return STUDIO_TEXT_COPY.refusalInvalidText;
    case 'unknown-font':
      return STUDIO_TEXT_COPY.refusalUnknownFont;
    case 'unsupported-variant':
      return STUDIO_TEXT_COPY.refusalUnsupportedVariant;
    case 'controlled-font-unavailable':
      return STUDIO_TEXT_COPY.refusalControlledFontUnavailable;
    case 'invalid-value':
      return STUDIO_TEXT_COPY.refusalInvalidValue;
    case 'outside-embroidery-area':
      return STUDIO_TEXT_COPY.refusalOutsideArea;
    case 'too-large-for-area':
      return STUDIO_TEXT_COPY.refusalTooLarge;
    default:
      return STUDIO_TEXT_COPY.refusalUnreadable;
  }
}
