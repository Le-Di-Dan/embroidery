'use client';

/**
 * The bottom tool bar (`APP3-S11`, `610:242` — `x=0 y=760 w=390 h=84`).
 *
 * Five targets, each 60×56 in the frame and each at least 44×44 of real hit area,
 * in the order the frame draws them:
 *
 * ```text
 * T | image | ↶ | ↷ | ⋯
 * ```
 *
 * ## The glyph is decoration
 *
 * Every control carries a word as its accessible name. `↶` is not a name, and a
 * customer using a screen reader on a phone is exactly the customer a five-glyph
 * bar would leave with nothing.
 *
 * ## Disabled means something, and says what
 *
 * `T` is off when no text element is selected, because `APP3-S05` is edit-only —
 * this bar has no create button and acquiring one would be that decision taken
 * here rather than by the checkpoint that owns it. Undo and redo are off exactly
 * when `APP3-S08` says the stack is empty. In all three cases the reason is real
 * text, referenced by `aria-describedby`, rather than a grey rectangle.
 *
 * The bar is the only tool surface at 390: the persistent left rail renders
 * nothing at this tier and the tablet drawer does not exist here, so there is one
 * way to reach each tool.
 */
import { memo } from 'react';

import { STUDIO_MOBILE_COPY } from '../model/studio-mobile-copy';
import type { StudioSheetName } from '../hooks/use-studio-mobile-sheets';

export interface StudioMobileToolbarProps {
  readonly open: StudioSheetName | null;
  readonly onToggle: (sheet: StudioSheetName) => void;
  readonly canEditText: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

const TEXT_HINT_ID = 'studio-mobile-text-hint';
const UNDO_HINT_ID = 'studio-mobile-undo-hint';
const REDO_HINT_ID = 'studio-mobile-redo-hint';

/**
 * Memoized for the reason the rail is: the screen above re-renders on every
 * pointer frame of a drag, and none of these props can change inside one.
 */
export const StudioMobileToolbar = memo(function StudioMobileToolbar({
  open,
  onToggle,
  canEditText,
  canUndo,
  canRedo,
  undo,
  redo,
}: StudioMobileToolbarProps) {
  return (
    <nav
      aria-label={STUDIO_MOBILE_COPY.toolbarLabel}
      className="studio-mobile-toolbar"
      data-testid="studio-mobile-toolbar"
    >
      <ToolButton
        describedBy={canEditText ? undefined : TEXT_HINT_ID}
        disabled={!canEditText}
        glyph="T"
        label={STUDIO_MOBILE_COPY.text}
        onClick={() => {
          onToggle('text');
        }}
        pressed={open === 'text'}
        testId="studio-mobile-text"
      />
      <ToolButton
        glyph="▣"
        label={STUDIO_MOBILE_COPY.image}
        onClick={() => {
          onToggle('image');
        }}
        pressed={open === 'image'}
        testId="studio-mobile-image"
      />
      <ToolButton
        describedBy={canUndo ? undefined : UNDO_HINT_ID}
        disabled={!canUndo}
        glyph="↶"
        label={STUDIO_MOBILE_COPY.undo}
        onClick={undo}
        testId="studio-mobile-undo"
      />
      <ToolButton
        describedBy={canRedo ? undefined : REDO_HINT_ID}
        disabled={!canRedo}
        glyph="↷"
        label={STUDIO_MOBILE_COPY.redo}
        onClick={redo}
        testId="studio-mobile-redo"
      />
      <ToolButton
        glyph="⋯"
        label={STUDIO_MOBILE_COPY.more}
        onClick={() => {
          onToggle('layers');
        }}
        pressed={open === 'layers'}
        testId="studio-mobile-layers"
      />

      {/*
        Why each control is off. Visually hidden rather than `display: none`,
        which would take the text out of the accessibility tree and leave every
        `aria-describedby` above pointing at nothing.
      */}
      {canEditText ? null : (
        <p className="studio-mobile-toolbar__reason" id={TEXT_HINT_ID}>
          {STUDIO_MOBILE_COPY.textUnavailable}
        </p>
      )}
      {canUndo ? null : (
        <p className="studio-mobile-toolbar__reason" id={UNDO_HINT_ID}>
          {STUDIO_MOBILE_COPY.undoUnavailable}
        </p>
      )}
      {canRedo ? null : (
        <p className="studio-mobile-toolbar__reason" id={REDO_HINT_ID}>
          {STUDIO_MOBILE_COPY.redoUnavailable}
        </p>
      )}
    </nav>
  );
});

interface ToolButtonProps {
  readonly describedBy?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly glyph: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean | undefined;
  readonly testId: string;
}

function ToolButton({
  describedBy,
  disabled = false,
  glyph,
  label,
  onClick,
  pressed,
  testId,
}: ToolButtonProps) {
  return (
    <button
      aria-describedby={describedBy}
      aria-label={label}
      aria-pressed={pressed}
      className="studio-mobile-toolbar__control"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
