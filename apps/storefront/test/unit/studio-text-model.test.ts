/**
 * The text capability's authority, called directly (`APP3-S05`).
 *
 * Everything here is pure, so the rules are proved by asking them rather than by
 * driving a form and inferring what must have happened. The component test is
 * the other half: it proves the form asks these questions at all.
 */
import {
  DESIGN_DOCUMENT_LIMITS,
  DESIGN_FONT_REGISTRY,
  type DesignDocument,
} from '@embroidery/design-document';

import { ruleOnTextCandidate } from '../../src/features/design-studio/model/studio-text-authority';
import {
  EDITABLE_TEXT_FIELDS,
  TEXT_ALIGN_OPTIONS,
  TEXT_FONT_OPTIONS,
  TEXT_NUMERIC_LIMITS,
  characterCount,
  textElementOf,
  weightOptionsFor,
  withTextFields,
} from '../../src/features/design-studio/model/studio-text-fields';
import {
  makeScope,
  makeStageDocument,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

/** Inside the fixture safe area (100,120 → 400,320). */
const INSIDE = { x: 150, y: 160, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 };

const scope = makeScope();

function documentWithText(overrides = {}): DesignDocument {
  return makeStageDocument([
    textElement('t', { transform: INSIDE, ...overrides }),
    shapeElement('s', { transform: INSIDE }),
  ]);
}

function rule(document: DesignDocument, patch: Parameters<typeof withTextFields>[2]) {
  return ruleOnTextCandidate(withTextFields(document, 't', patch), 't', scope, null);
}

describe('the editable field set is closed by P01 (APP3-S05 §7)', () => {
  it('edits only fields the v1 TextElement actually carries', () => {
    expect([...EDITABLE_TEXT_FIELDS]).toEqual([
      'text',
      'fontId',
      'fontSizePx',
      'fontWeight',
      'fontStyle',
      'textAlign',
    ]);
  });

  it('offers no field the schema cannot persist', () => {
    for (const invented of [
      'fontFamily',
      'letterSpacing',
      'lineHeight',
      'curve',
      'threadColor',
      'stitchDensity',
    ]) {
      expect(EDITABLE_TEXT_FIELDS).not.toContain(invented);
    }
  });

  it('takes its numeric bounds from P01 rather than restating them', () => {
    expect(TEXT_NUMERIC_LIMITS.maxCharacters).toBe(
      DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement,
    );
    expect(TEXT_NUMERIC_LIMITS.maxTotalCharacters).toBe(
      DESIGN_DOCUMENT_LIMITS.maxTotalTextCharacters,
    );
  });

  it('exposes exactly P01s three alignments', () => {
    expect([...TEXT_ALIGN_OPTIONS]).toEqual(['left', 'center', 'right']);
  });
});

describe('the font picker is the controlled registry (APP3-S05 §8, §15)', () => {
  it('offers every registry entry and nothing else', () => {
    expect(TEXT_FONT_OPTIONS.map((option) => option.fontId)).toEqual(
      DESIGN_FONT_REGISTRY.map((font) => font.fontId),
    );
  });

  it('contains Inter', () => {
    expect(TEXT_FONT_OPTIONS).toContainEqual({ fontId: 'inter', family: 'Inter' });
  });

  it('contains no arbitrary or system font, and never General Sans', () => {
    const families = TEXT_FONT_OPTIONS.map((option) => option.family);
    for (const rejected of ['General Sans', 'Arial', 'Roboto', 'Times New Roman', 'system-ui']) {
      expect(families).not.toContain(rejected);
    }
  });

  it('keeps a weight the document already holds even when it is off the steps', () => {
    // P01 accepts any integer 100..900. A picker that dropped 450 would render
    // with no matching option and silently carry a different weight into the
    // next edit.
    expect(weightOptionsFor(450)).toContain(450);
    expect(weightOptionsFor(400)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('refuses a font that is not in the registry', () => {
    const outcome = rule(documentWithText(), { fontId: 'helvetica' });
    expect(outcome).toEqual({ ok: false, refusal: 'unknown-font' });
  });

  it('refuses a variant the controlled family does not provide', () => {
    // 950 is outside Inter's 100..900 and is a whole number, so it passes
    // structure and is caught by the registry rather than by the schema.
    const outcome = rule(documentWithText(), { fontWeight: 950 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('unsupported-variant');
  });

  it('accepts both controlled styles and a supported weight', () => {
    expect(rule(documentWithText(), { fontStyle: 'italic' }).ok).toBe(true);
    expect(rule(documentWithText(), { fontWeight: 700 }).ok).toBe(true);
  });
});

describe('P01 text limits are preserved exactly (APP3-S05 §14)', () => {
  it('counts code points, not UTF-16 units', () => {
    // One astral character: `length` is 2, and the customer must be charged 1.
    expect(characterCount('𝟘')).toBe(1);
    expect('𝟘'.length).toBe(2);
  });

  it('accepts exactly 500 code points', () => {
    const outcome = rule(documentWithText(), { text: 'a'.repeat(500) });
    expect(outcome.ok).toBe(true);
  });

  it('refuses 501', () => {
    const outcome = rule(documentWithText(), { text: 'a'.repeat(501) });
    expect(outcome).toEqual({ ok: false, refusal: 'text-too-long' });
  });

  it('charges an astral character once against the per-element limit', () => {
    // 500 astral code points are 1000 UTF-16 units. A UTF-16 count would refuse
    // this, and the customer would be silently held to 250 characters.
    expect(rule(documentWithText(), { text: '𝟘'.repeat(500) }).ok).toBe(true);
    expect(rule(documentWithText(), { text: '𝟘'.repeat(501) })).toEqual({
      ok: false,
      refusal: 'text-too-long',
    });
  });

  it('accepts a document at exactly the 5000-character total', () => {
    const filler = Array.from({ length: 9 }, (_, index) =>
      textElement(`f${String(index)}`, { transform: INSIDE, text: 'a'.repeat(500) }),
    );
    const document = makeStageDocument([textElement('t', { transform: INSIDE }), ...filler]);
    const outcome = ruleOnTextCandidate(
      withTextFields(document, 't', { text: 'a'.repeat(500) }),
      't',
      scope,
      null,
    );
    expect(outcome.ok).toBe(true);
  });

  it('refuses the document total separately from the per-element limit', () => {
    const filler = Array.from({ length: 10 }, (_, index) =>
      textElement(`f${String(index)}`, { transform: INSIDE, text: 'a'.repeat(500) }),
    );
    const document = makeStageDocument([textElement('t', { transform: INSIDE }), ...filler]);
    const outcome = ruleOnTextCandidate(
      withTextFields(document, 't', { text: 'a' }),
      't',
      scope,
      null,
    );
    // The edited element holds one character; the refusal is about the design.
    expect(outcome).toEqual({ ok: false, refusal: 'document-text-limit' });
  });

  it('truncates nothing and deletes nothing on refusal', () => {
    const document = documentWithText();
    const outcome = rule(document, { text: 'a'.repeat(501) });
    expect(outcome.ok).toBe(false);
    // The input document is untouched: refusal returns no document at all.
    expect(textElementOf(document, 't')?.text).toBe('Xin chào');
  });
});

describe('P01 decides text validity, and is never second-guessed (APP3-S05 §13)', () => {
  it('refuses a non-NFC candidate rather than normalizing it', () => {
    // Built by normalizing rather than typed as a literal. A decomposed literal
    // in a source file is one git filter, editor setting or formatter away from
    // being silently recomposed — and the test would then still pass while
    // proving nothing.
    const decomposed = 'Việt'.normalize('NFD');
    expect(decomposed.normalize('NFC')).not.toBe(decomposed);

    const outcome = rule(documentWithText(), { text: decomposed });
    expect(outcome).toEqual({ ok: false, refusal: 'invalid-text' });
  });

  it('accepts the composed form of the same word', () => {
    const outcome = rule(documentWithText(), { text: 'Việt'.normalize('NFC') });
    expect(outcome.ok).toBe(true);
    if (outcome.ok)
      expect(textElementOf(outcome.document, 't')?.text).toBe('Việt'.normalize('NFC'));
  });

  it('accepts empty text — clearing a text box is legal', () => {
    expect(rule(documentWithText(), { text: '' }).ok).toBe(true);
  });

  it('refuses an out-of-range or non-finite numeric value', () => {
    for (const fontSizePx of [0, -4, Number.NaN, 1001]) {
      const outcome = rule(documentWithText(), { fontSizePx });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.refusal).toBe('invalid-value');
    }
  });

  it('refuses a fractional weight, which P01 requires to be whole', () => {
    const outcome = rule(documentWithText(), { fontWeight: 450.5 });
    expect(outcome).toEqual({ ok: false, refusal: 'invalid-value' });
  });
});

describe('a text edit changes text and nothing else (APP3-S05 §12, §17)', () => {
  it('preserves the id, transform, opacity, flags, fill and z-order', () => {
    const document = documentWithText();
    const before = textElementOf(document, 't');
    const outcome = rule(document, { text: 'Xin chào bạn' });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const after = textElementOf(outcome.document, 't');

    expect(after?.id).toBe('t');
    expect(after?.transform).toEqual(before?.transform);
    expect(after?.opacity).toBe(before?.opacity);
    expect(after?.visible).toBe(before?.visible);
    expect(after?.locked).toBe(before?.locked);
    // `fill` is a P01 field this checkpoint does not edit; it must survive
    // untouched rather than be normalized on the way past.
    expect(after?.fill).toBe(before?.fill);
    expect(outcome.document.elements.map((element) => element.id)).toEqual(['t', 's']);
  });

  it('leaves every other element identical', () => {
    const document = documentWithText();
    const outcome = rule(document, { fontSizePx: 40 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document.elements[1]).toEqual(document.elements[1]);
  });

  it('does not resize the declared box when the font size changes', () => {
    // `APP3-P02` PO-08 measures text from its declared box and performs no font
    // measurement. A glyph-driven auto-resize would be a second geometry
    // authority, and this is what would catch one.
    const outcome = rule(documentWithText(), { fontSizePx: 96 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(textElementOf(outcome.document, 't')?.transform).toEqual(INSIDE);
  });

  it('leaves a non-text element alone when the id names one', () => {
    const document = documentWithText();
    const candidate = withTextFields(document, 's', { text: 'nope' });
    expect(candidate.elements[1]).toEqual(document.elements[1]);
  });
});

describe('geometry stays APP3-P02s (APP3-S05 §17)', () => {
  it('still refuses a document whose element sits outside the embroidery area', () => {
    const outside = makeStageDocument([
      textElement('t', {
        transform: { ...INSIDE, x: 900, y: 700 },
      }),
    ]);
    const outcome = ruleOnTextCandidate(
      withTextFields(outside, 't', { text: 'xa' }),
      't',
      scope,
      null,
    );
    expect(outcome).toEqual({ ok: false, refusal: 'outside-embroidery-area' });
  });

  it('resolves a text element only when the selection actually names one', () => {
    const document = documentWithText();
    expect(textElementOf(document, 't')?.type).toBe('text');
    expect(textElementOf(document, 's')).toBeUndefined();
    expect(textElementOf(document, null)).toBeUndefined();
    expect(textElementOf(null, 't')).toBeUndefined();
  });
});
