'use client';

/**
 * Whether one *exact* controlled face is available in this browser
 * (`APP3-S05-C1`).
 *
 * ## Why a family is not the question
 *
 * `APP3-S05` asked the browser whether the family `Inter` had loaded. That
 * question has a true answer while the state it describes is false: the upright
 * face arrives, the family reports ready, the customer selects italic, the
 * italic binary never arrives — and the browser synthesises a slant. A
 * synthesised oblique is not the face `APP3-F01` audited, has different outlines
 * and would be digitised into stitches the customer never approved, with the
 * inspector still saying the controlled font is ready.
 *
 * The registry's locked policy is `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`, and
 * it is written per *variant* — `styles: normal | italic`, weights `100..900`.
 * So the runtime question has to be per variant too: `fontId` **and**
 * `fontStyle` **and** `fontWeight`.
 *
 * ## What is asked, and of whom
 *
 * `document.fonts.load` with a full CSS font shorthand. The shorthand carries
 * the style and the weight, so the engine resolves the same face it would paint
 * with, and it names the controlled family alone — appending a fallback would
 * make every probe succeed by matching the fallback, which is the failure this
 * module exists to detect.
 *
 * A variable font covers `100..900` in one binary, so several weights legally
 * resolve to the same file. That is the engine's business, not this module's:
 * readiness is still requested with the weight the document actually holds, so
 * the answer stays true if the registry ever ships separate weight files.
 */
import { findControlledFont, supportsVariant, type FontStyle } from '@embroidery/design-document';

/** The exact face a document element asks to be painted with. */
export interface ControlledFontVariant {
  readonly fontId: string;
  readonly fontStyle: FontStyle;
  readonly fontWeight: number;
}

/**
 * The size in the probe shorthand.
 *
 * A CSS font shorthand is invalid without one, and it has no bearing on which
 * face is selected. It is a constant here precisely so it can never be read from
 * a document: a probe built from `fontSizePx` would make readiness look like a
 * property of the customer's chosen size.
 */
const PROBE_SIZE_PX = 16;

/** Identity of a variant request, for comparing one against another. */
export function variantKey(variant: ControlledFontVariant): string {
  return `${variant.fontId}|${variant.fontStyle}|${String(variant.fontWeight)}`;
}

/**
 * The CSS shorthand for a variant, or `undefined` when the registry does not
 * control that face at all.
 *
 * `undefined` is not a failure: an unregistered font or an unsupported variant
 * is `APP3-P01`'s refusal to make, with its own sentence. Asking the browser
 * about it would answer a different question and produce the wrong one.
 */
export function variantShorthand(variant: ControlledFontVariant): string | undefined {
  const font = findControlledFont(variant.fontId);
  if (font === undefined) return undefined;
  if (!supportsVariant(font, variant.fontStyle, variant.fontWeight)) return undefined;
  return `${variant.fontStyle} ${String(variant.fontWeight)} ${String(PROBE_SIZE_PX)}px "${font.family}"`;
}

/**
 * Whether this environment can answer the question at all.
 *
 * "No font-loading API" is not a load result — it is the absence of anyone to
 * ask — so callers that must react synchronously check it first rather than
 * awaiting a promise whose answer was decided before it was created.
 */
export function fontLoadingAvailable(): boolean {
  return typeof document !== 'undefined' && document.fonts !== undefined;
}

/**
 * Asks the browser to resolve exactly this face.
 *
 * `true` only when a face actually matched and loaded. A rejected promise (the
 * binary failed to fetch), an empty match set (nothing satisfies the
 * description) and a browser with no font-loading API all answer `false` — the
 * conservative direction, because the cost of a wrong `true` is a design shown
 * in a face nobody approved.
 */
export async function loadControlledVariant(variant: ControlledFontVariant): Promise<boolean> {
  const shorthand = variantShorthand(variant);
  if (shorthand === undefined) return false;
  if (!fontLoadingAvailable()) return false;
  try {
    const matched = await document.fonts.load(shorthand);
    return matched.length > 0;
  } catch {
    return false;
  }
}
