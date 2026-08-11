/**
 * Which text properties `APP3-S05` may edit, and what a candidate looks like.
 *
 * Every option and every bound in this file is *read* from `APP3-P01` rather
 * than written here. That is the whole point of the module: a font list typed
 * out by hand would offer a face the registry does not control, a weight range
 * typed out by hand would drift from the one validation enforces, and both would
 * look correct until the day P01 changed.
 *
 * The supported set is therefore closed by construction. `TextElement` v1 holds
 * `text`, `fontId`, `fontSizePx`, `fontWeight`, `fontStyle`, `textAlign` and
 * `fill`; nothing else can be persisted, so nothing else can be a control. There
 * is no `fontFamily`, no letter spacing, no line height, no text-on-path and no
 * thread palette, because none of them exists in the schema and inventing one
 * would produce a document `APP3-P01` refuses to read.
 *
 * `fill` is deliberately absent from the editable set — see `EDITABLE_TEXT_FIELDS`.
 *
 * Pure: no React, no DOM, no store, no clock.
 */
import {
  DESIGN_DOCUMENT_LIMITS,
  DESIGN_DOCUMENT_VALUE_RANGES,
  DESIGN_FONT_REGISTRY,
  type DesignDocument,
  type FontStyle,
  type TextAlign,
  type TextElement,
} from '@embroidery/design-document';

/**
 * The persisted text fields this checkpoint edits.
 *
 * `fill` is a P01 field and is still **not** here. The accepted `APP3-S05`
 * design draws three states — Editing, Font Picker, Validation & Font Loading —
 * and none of them is a colour state; and P01 validates `fill` only as a
 * non-empty NFC string, so it publishes no colour format, no palette and no
 * thread semantics for a control to be correct against. A colour control would
 * therefore have to invent both its design and its contract. `S05` leaves the
 * document's stored `fill` untouched and paints it exactly as it is.
 */
export const EDITABLE_TEXT_FIELDS = Object.freeze([
  'text',
  'fontId',
  'fontSizePx',
  'fontWeight',
  'fontStyle',
  'textAlign',
] as const);

export type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];

/** One entry per controlled font. Today the registry holds exactly one. */
export interface TextFontOption {
  readonly fontId: string;
  readonly family: string;
}

/**
 * The font picker's whole contents, derived from the controlled registry.
 *
 * Not a curated list: `DESIGN_FONT_REGISTRY` is the authority, so a font added
 * to it appears here and a font removed from it disappears. General Sans is the
 * interface chrome's CSS fallback and has no registry entry, which is exactly
 * why it can never be offered as a document font.
 */
export const TEXT_FONT_OPTIONS: readonly TextFontOption[] = Object.freeze(
  DESIGN_FONT_REGISTRY.map((font) => Object.freeze({ fontId: font.fontId, family: font.family })),
);

export const TEXT_ALIGN_OPTIONS: readonly TextAlign[] = Object.freeze(['left', 'center', 'right']);
export const FONT_STYLE_OPTIONS: readonly FontStyle[] = Object.freeze(['normal', 'italic']);

/** P01's own numeric bounds, re-exported so no component restates one. */
export const TEXT_NUMERIC_LIMITS = Object.freeze({
  minFontSizePx: DESIGN_DOCUMENT_VALUE_RANGES.minFontSizePx,
  maxFontSizePx: DESIGN_DOCUMENT_VALUE_RANGES.maxFontSizePx,
  minFontWeight: DESIGN_DOCUMENT_VALUE_RANGES.minFontWeight,
  maxFontWeight: DESIGN_DOCUMENT_VALUE_RANGES.maxFontWeight,
  maxCharacters: DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement,
  maxTotalCharacters: DESIGN_DOCUMENT_LIMITS.maxTotalTextCharacters,
});

/** The nine conventional steps inside P01's range. Not a narrowing of it. */
const WEIGHT_STEPS: readonly number[] = Object.freeze([
  100, 200, 300, 400, 500, 600, 700, 800, 900,
]);

/**
 * Weight choices, always including the value the document already holds.
 *
 * P01 accepts any integer from 100 to 900, so a document may legally store 450.
 * A picker offering only the nine steps would render with no matching option and
 * silently show the wrong weight — and the first edit of any other field would
 * then carry that wrong weight into the document. Including the current value
 * keeps the control an honest view of what is stored.
 */
export function weightOptionsFor(current: number): readonly number[] {
  if (WEIGHT_STEPS.includes(current)) return WEIGHT_STEPS;
  return Object.freeze([...WEIGHT_STEPS, current].sort((left, right) => left - right));
}

/** How many characters a text element holds, counted as P01 counts them. */
export function characterCount(text: string): number {
  // Code points, not UTF-16 units: an astral character is one of the customer's
  // 500, and `text.length` would charge them two.
  return [...text].length;
}

/** A partial change to the editable fields. Absent keys are left alone. */
export type TextFieldPatch = Partial<{
  readonly text: string;
  readonly fontId: string;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly fontStyle: FontStyle;
  readonly textAlign: TextAlign;
}>;

/** The selected element, when it is text. `undefined` for every other kind. */
export function textElementOf(
  document: DesignDocument | null,
  elementId: string | null,
): TextElement | undefined {
  if (document === null || elementId === null) return undefined;
  const element = document.elements.find((candidate) => candidate.id === elementId);
  return element?.type === 'text' ? element : undefined;
}

/**
 * The candidate document, with one text element's editable fields changed.
 *
 * Everything else is carried through by identity: the element's `id`, its
 * `transform`, its `opacity`, its `visible` and `locked` flags, its `fill`, and
 * its position in the array — which **is** z-order. Editing text moves nothing
 * and restacks nothing, and the only way to guarantee that is to never write
 * those fields at all.
 */
export function withTextFields(
  document: DesignDocument,
  elementId: string,
  patch: TextFieldPatch,
): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      element.id === elementId && element.type === 'text' ? { ...element, ...patch } : element,
    ),
  };
}
