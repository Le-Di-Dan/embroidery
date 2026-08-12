'use client';

/**
 * The individual text property controls (`APP3-S05`, `608:176`, `608:231`).
 *
 * Split from the inspector by responsibility: the inspector decides *whether*
 * this element may be edited and what to say when it may not, and this file is
 * the form. Every control is a real HTML form control — a `<select>`, an
 * `<input type="number">`, a `<textarea>` — carrying the shared Input semantics
 * rather than a hand-built listbox, so keyboard operation, screen-reader
 * announcement and the touch-target minimum come from the platform.
 *
 * The artwork stays SVG. These are the inspector's chrome, not the stage.
 *
 * Every option set and every bound is read from `APP3-P01` through
 * `studio-text-fields`; there is not a font name, a weight, an alignment or a
 * numeric limit written literally anywhere below.
 */
import { useId } from 'react';

import type { FontStyle, TextAlign, TextElement } from '@embroidery/design-document';

import { STUDIO_TEXT_COPY } from '../model/studio-text-copy';
import {
  FONT_STYLE_OPTIONS,
  TEXT_ALIGN_OPTIONS,
  TEXT_FONT_OPTIONS,
  TEXT_NUMERIC_LIMITS,
  characterCount,
  weightOptionsFor,
  type TextFieldPatch,
} from '../model/studio-text-fields';

export interface StudioTextControlsProps {
  readonly element: TextElement;
  /** The transient field value while one exists; `null` means "use the document". */
  readonly draft: string | null;
  readonly describedBy: string | undefined;
  readonly onChangeText: (value: string) => void;
  readonly onStartComposition: () => void;
  readonly onFinishText: (value: string) => void;
  readonly onPatch: (patch: TextFieldPatch) => void;
  /** The text box gained the caret: one edit session begins (`APP3-S08`). */
  readonly onBeginEdit: () => void;
  /** It lost the caret: the session ends, and becomes at most one history entry. */
  readonly onEndEdit: () => void;
}

const ALIGN_LABELS: Readonly<Record<TextAlign, string>> = Object.freeze({
  left: STUDIO_TEXT_COPY.alignLeft,
  center: STUDIO_TEXT_COPY.alignCenter,
  right: STUDIO_TEXT_COPY.alignRight,
});

const STYLE_LABELS: Readonly<Record<FontStyle, string>> = Object.freeze({
  normal: STUDIO_TEXT_COPY.styleNormal,
  italic: STUDIO_TEXT_COPY.styleItalic,
});

export function StudioTextControls({
  element,
  draft,
  describedBy,
  onChangeText,
  onStartComposition,
  onFinishText,
  onPatch,
  onBeginEdit,
  onEndEdit,
}: StudioTextControlsProps) {
  const ids = useId();
  const value = draft ?? element.text;

  return (
    <div className="studio-text__fields">
      <div className="studio-text__field">
        <label className="studio-text__label" htmlFor={`${ids}-text`}>
          {STUDIO_TEXT_COPY.textLabel}
        </label>
        <textarea
          id={`${ids}-text`}
          className="studio-text__textarea"
          data-testid="studio-text-value"
          value={value}
          rows={3}
          aria-describedby={joinIds(`${ids}-text-hint`, describedBy)}
          onChange={(event) => {
            onChangeText(event.target.value);
          }}
          onFocus={onBeginEdit}
          onCompositionStart={onStartComposition}
          onCompositionEnd={(event) => {
            // The composed result is on the element, not in the React value:
            // `compositionend` fires before React's own change for the same
            // frame in some engines, so reading the target is the only reading
            // guaranteed to be the finished string.
            onFinishText(event.currentTarget.value);
          }}
          onBlur={(event) => {
            // The value first, then the boundary: closing the session before the
            // last committed characters had landed would leave them outside the
            // entry they belong to.
            onFinishText(event.currentTarget.value);
            onEndEdit();
          }}
        />
        <p className="studio-text__hint" id={`${ids}-text-hint`}>
          {STUDIO_TEXT_COPY.textHint}{' '}
          <span data-testid="studio-text-remaining">
            {STUDIO_TEXT_COPY.textRemaining(
              Math.max(TEXT_NUMERIC_LIMITS.maxCharacters - characterCount(value), 0),
            )}
          </span>
        </p>
      </div>

      <div className="studio-text__field">
        <label className="studio-text__label" htmlFor={`${ids}-font`}>
          {STUDIO_TEXT_COPY.fontLabel}
        </label>
        <select
          id={`${ids}-font`}
          className="studio-text__select"
          data-testid="studio-text-font"
          value={element.fontId}
          aria-describedby={joinIds(`${ids}-font-hint`, describedBy)}
          onChange={(event) => {
            onPatch({ fontId: event.target.value });
          }}
        >
          {TEXT_FONT_OPTIONS.map((option) => (
            <option key={option.fontId} value={option.fontId}>
              {option.family}
            </option>
          ))}
        </select>
        <p className="studio-text__hint" id={`${ids}-font-hint`}>
          {STUDIO_TEXT_COPY.fontHint}
        </p>
      </div>

      <div className="studio-text__row">
        <div className="studio-text__field">
          <label className="studio-text__label" htmlFor={`${ids}-style`}>
            {STUDIO_TEXT_COPY.styleLabel}
          </label>
          <select
            id={`${ids}-style`}
            className="studio-text__select"
            data-testid="studio-text-style"
            value={element.fontStyle}
            aria-describedby={describedBy}
            onChange={(event) => {
              onPatch({ fontStyle: event.target.value as FontStyle });
            }}
          >
            {FONT_STYLE_OPTIONS.map((style) => (
              <option key={style} value={style}>
                {STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </div>

        <div className="studio-text__field">
          <label className="studio-text__label" htmlFor={`${ids}-weight`}>
            {STUDIO_TEXT_COPY.weightLabel}
          </label>
          <select
            id={`${ids}-weight`}
            className="studio-text__select"
            data-testid="studio-text-weight"
            value={String(element.fontWeight)}
            aria-describedby={describedBy}
            onChange={(event) => {
              onPatch({ fontWeight: Number(event.target.value) });
            }}
          >
            {weightOptionsFor(element.fontWeight).map((weight) => (
              <option key={weight} value={String(weight)}>
                {String(weight)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="studio-text__row">
        <div className="studio-text__field">
          <label className="studio-text__label" htmlFor={`${ids}-size`}>
            {STUDIO_TEXT_COPY.sizeLabel}
          </label>
          <input
            id={`${ids}-size`}
            className="studio-text__input"
            data-testid="studio-text-size"
            type="number"
            inputMode="decimal"
            min={TEXT_NUMERIC_LIMITS.minFontSizePx}
            max={TEXT_NUMERIC_LIMITS.maxFontSizePx}
            value={String(element.fontSizePx)}
            aria-describedby={describedBy}
            onChange={(event) => {
              // `Number('')` is 0, which P01 refuses as a size — exactly the
              // right answer, and it arrives as a stated refusal rather than as
              // a repaired value.
              onPatch({ fontSizePx: Number(event.target.value) });
            }}
          />
        </div>

        <div className="studio-text__field">
          <label className="studio-text__label" htmlFor={`${ids}-align`}>
            {STUDIO_TEXT_COPY.alignLabel}
          </label>
          <select
            id={`${ids}-align`}
            className="studio-text__select"
            data-testid="studio-text-align"
            value={element.textAlign}
            aria-describedby={describedBy}
            onChange={(event) => {
              onPatch({ textAlign: event.target.value as TextAlign });
            }}
          >
            {TEXT_ALIGN_OPTIONS.map((align) => (
              <option key={align} value={align}>
                {ALIGN_LABELS[align]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/** An `aria-describedby` list, skipping the ids that are not present. */
function joinIds(...ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined);
  return present.length === 0 ? undefined : present.join(' ');
}
