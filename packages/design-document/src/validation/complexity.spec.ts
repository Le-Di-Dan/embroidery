/**
 * Complexity limits, each asserted at the boundary **and** at boundary + 1.
 *
 * A limit tested only by its failure case can be off by one in the permissive
 * direction and nobody notices; a limit tested only by its success case can be
 * off in the strict direction and customers hit it. Both ends are pinned here.
 *
 * The counting-rule cases matter more than the arithmetic ones: hidden and
 * locked elements still count, and one Asset placed twenty times is one Asset
 * but twenty image elements.
 */
import { DESIGN_DOCUMENT_LIMITS as LIMITS } from '../schema/constants';
import { prepareDesignDocument } from '../canonical/canonicalize';
import {
  documentWith,
  emptyDocument,
  imageElement,
  repeatImage,
  repeatText,
  textElement,
} from '../testing/fixtures';
import { validateCanonicalSize, validateDesignDocumentComplexity } from './complexity';

const measures = (document: Parameters<typeof validateDesignDocumentComplexity>[0]): string[] =>
  validateDesignDocumentComplexity(document).map((item) => String(item.meta?.measure));

describe('element counts', () => {
  it('accepts exactly the maximum number of elements', () => {
    expect(measures(documentWith(repeatText(LIMITS.maxElements)))).not.toContain('elements');
  });

  it('rejects one element beyond the maximum', () => {
    expect(measures(documentWith(repeatText(LIMITS.maxElements + 1)))).toContain('elements');
  });

  it('accepts exactly the maximum image elements and rejects one more', () => {
    expect(measures(documentWith(repeatImage(LIMITS.maxImageElements)))).not.toContain(
      'imageElements',
    );
    expect(measures(documentWith(repeatImage(LIMITS.maxImageElements + 1)))).toContain(
      'imageElements',
    );
  });

  it('accepts exactly the maximum text elements and rejects one more', () => {
    expect(measures(documentWith(repeatText(LIMITS.maxTextElements)))).not.toContain(
      'textElements',
    );
    expect(measures(documentWith(repeatText(LIMITS.maxTextElements + 1)))).toContain(
      'textElements',
    );
  });
});

describe('asset budgets', () => {
  it('accepts exactly the maximum unique assets and rejects one more', () => {
    expect(measures(documentWith(repeatImage(LIMITS.maxUniqueAssets)))).not.toContain(
      'uniqueAssets',
    );
    expect(measures(documentWith(repeatImage(LIMITS.maxUniqueAssets + 1)))).toContain(
      'uniqueAssets',
    );
  });

  it('counts a repeated asset once for the asset budget but each time as an element', () => {
    // Twenty-one placements of ONE asset: within the asset budget, over the
    // image-element budget. If the two were conflated, exactly one of these
    // assertions would flip.
    const elements = repeatImage(LIMITS.maxImageElements + 1, true);
    const found = measures(documentWith(elements));
    expect(found).not.toContain('uniqueAssets');
    expect(found).toContain('imageElements');
  });
});

describe('text characters', () => {
  it('accepts exactly the maximum characters in one element and rejects one more', () => {
    const at = textElement({ text: 'a'.repeat(LIMITS.maxCharactersPerTextElement) });
    const over = textElement({ text: 'a'.repeat(LIMITS.maxCharactersPerTextElement + 1) });
    expect(measures(documentWith([at]))).not.toContain('charactersPerTextElement');
    expect(measures(documentWith([over]))).toContain('charactersPerTextElement');
  });

  it('accepts exactly the maximum total characters and rejects one more', () => {
    const perElement = LIMITS.maxCharactersPerTextElement;
    const full = repeatText(LIMITS.maxTotalTextCharacters / perElement, {
      text: 'a'.repeat(perElement),
    });
    expect(measures(documentWith(full))).not.toContain('totalTextCharacters');

    const over = [...full, textElement({ id: 'extra', text: 'a' })];
    expect(measures(documentWith(over))).toContain('totalTextCharacters');
  });

  it('counts code points, so a non-BMP character costs one, not two', () => {
    const astral = '🧵'.repeat(LIMITS.maxCharactersPerTextElement);
    expect(astral.length).toBeGreaterThan(LIMITS.maxCharactersPerTextElement);
    expect(measures(documentWith([textElement({ text: astral })]))).not.toContain(
      'charactersPerTextElement',
    );
  });
});

describe('visibility never exempts', () => {
  it('counts hidden and locked elements', () => {
    const hidden = repeatText(LIMITS.maxElements + 1, { visible: false, locked: true });
    expect(measures(documentWith(hidden))).toContain('elements');
  });

  it('counts a hidden image toward the image and asset budgets', () => {
    const elements = [
      ...repeatImage(LIMITS.maxImageElements),
      imageElement({
        id: 'hidden',
        assetId: 'asset-x',
        derivativeId: 'derivative-x',
        visible: false,
      }),
    ];
    const found = measures(documentWith(elements));
    expect(found).toContain('imageElements');
    expect(found).toContain('uniqueAssets');
  });
});

describe('canonical byte size', () => {
  it('accepts a document at exactly the ceiling', () => {
    expect(validateCanonicalSize(LIMITS.maxCanonicalBytes)).toEqual([]);
  });

  it('rejects one byte beyond the ceiling', () => {
    const findings = validateCanonicalSize(LIMITS.maxCanonicalBytes + 1);
    expect(findings.map((item) => item.code)).toEqual(['COMPLEXITY_LIMIT_EXCEEDED']);
  });

  it('is measured on UTF-8 bytes, not string length', () => {
    // A Vietnamese document is mostly multi-byte, so counting characters would
    // let roughly twice the ruled limit through.
    const result = prepareDesignDocument(documentWith([textElement({ text: 'ệ'.repeat(100) })]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value === undefined).toBe(false);
      expect(result.value.canonicalBytes.byteLength).toBeGreaterThan(result.value.canonical.length);
    }
  });

  it('measures the bytes the pipeline actually produced, after quantization', () => {
    const result = prepareDesignDocument(emptyDocument());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canonicalBytes.byteLength).toBe(
        new TextEncoder().encode(result.value.canonical).byteLength,
      );
    }
  });
});

describe('rejection is total', () => {
  it('never truncates a document into compliance', () => {
    const document = documentWith(repeatText(LIMITS.maxElements + 5));
    const result = prepareDesignDocument(document);
    expect(result.ok).toBe(false);
    // The offending document is untouched; nothing was dropped to make it fit.
    expect(document.elements).toHaveLength(LIMITS.maxElements + 5);
  });

  it('reports the limit and the actual value so a caller can explain it', () => {
    const findings = validateDesignDocumentComplexity(
      documentWith(repeatText(LIMITS.maxElements + 1)),
    );
    expect(findings[0]?.meta).toMatchObject({
      measure: 'elements',
      actual: LIMITS.maxElements + 1,
      limit: LIMITS.maxElements,
    });
  });
});
