/**
 * Quantization.
 *
 * The precision is not a choice this package made, so the first test asserts
 * the constant against its authority rather than against a number someone liked
 * — if `APP0-R01`'s evidence ever changed, this is where it would surface.
 *
 * Idempotence is the property that actually matters in production: autosave
 * quantizes, the client reloads the quantized document, edits nothing and saves
 * again. If a second pass moved anything, that no-op round trip would change the
 * hash and look like a real edit.
 */
import {
  documentWith,
  emptyDocument,
  freehandElement,
  placement,
  textElement,
  transform,
} from '../testing/fixtures';
import {
  DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY,
  DESIGN_DOCUMENT_QUANTIZATION_DECIMALS,
  DESIGN_DOCUMENT_QUANTIZATION_SCALE,
  DESIGN_DOCUMENT_QUANTIZATION_STEP,
  DesignDocumentQuantizationError,
  quantizeDesignDocument,
  quantizeNumber,
} from './quantize';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('the locked precision', () => {
  it('is the constant APP0-R01 executed, not a new one', () => {
    expect(DESIGN_DOCUMENT_QUANTIZATION_SCALE).toBe(10_000);
    expect(DESIGN_DOCUMENT_QUANTIZATION_DECIMALS).toBe(4);
    expect(DESIGN_DOCUMENT_QUANTIZATION_STEP).toBeCloseTo(0.0001, 10);
  });

  it('records where the constant came from', () => {
    expect(DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY).toContain('ADR-APP0-001');
    expect(DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY).toContain('APP0-R01');
  });
});

describe('quantizeNumber', () => {
  it('rounds to four decimal places', () => {
    expect(quantizeNumber(1.234_56)).toBe(1.2346);
    expect(quantizeNumber(1.234_54)).toBe(1.2345);
    expect(quantizeNumber(10)).toBe(10);
  });

  it('removes accumulated float noise', () => {
    expect(quantizeNumber(0.1 + 0.2)).toBe(0.3);
    expect(quantizeNumber(100.000_000_000_1)).toBe(100);
  });

  it('normalizes negative zero to zero', () => {
    expect(Object.is(quantizeNumber(-0), 0)).toBe(true);
    expect(Object.is(quantizeNumber(-0.000_01), 0)).toBe(true);
  });

  it('handles values sitting on a rounding boundary', () => {
    // Math.round is half-up, which is what the evidence executed.
    expect(quantizeNumber(0.000_05)).toBe(0.0001);
    expect(quantizeNumber(-0.000_05)).toBe(0);
    expect(quantizeNumber(1.000_05)).toBe(1.0001);
    expect(quantizeNumber(2.5)).toBe(2.5);
  });

  it('is idempotent', () => {
    for (const value of [0.1 + 0.2, 1.234_56, -7.891_23, 1e-9, 12_345.678_9]) {
      expect(quantizeNumber(quantizeNumber(value))).toBe(quantizeNumber(value));
    }
  });

  it('refuses a non-finite number rather than producing a hashable NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => quantizeNumber(bad)).toThrow(DesignDocumentQuantizationError);
    }
  });
});

describe('quantizeDesignDocument', () => {
  it('quantizes transforms, placement, opacity, font size and stroke width', () => {
    const document = {
      ...emptyDocument(),
      placement: placement({ pxPerMm: 5.000_004 }),
      elements: [
        textElement({
          opacity: 0.500_004,
          fontSizePx: 24.000_06,
          transform: transform({ x: 10.000_04, rotationDeg: -0 }),
        }),
      ],
    };
    const quantized = quantizeDesignDocument(document);
    expect(quantized.placement.pxPerMm).toBe(5);
    const element = quantized.elements[0];
    expect(element?.opacity).toBe(0.5);
    expect(element?.transform.x).toBe(10);
    expect(Object.is(element?.transform.rotationDeg, 0)).toBe(true);
    if (element?.type === 'text') expect(element.fontSizePx).toBe(24.0001);
  });

  it('quantizes every freehand coordinate', () => {
    const points = [
      { x: 0.000_04, y: 1.234_56 },
      { x: -0, y: 2.999_999 },
    ];
    const quantized = quantizeDesignDocument(documentWith([freehandElement({ points })]));
    const element = quantized.elements[0];
    expect(element?.type).toBe('freehand');
    if (element?.type === 'freehand') {
      expect(element.points[0]).toEqual({ x: 0, y: 1.2346 });
      expect(element.points[1]).toEqual({ x: 0, y: 3 });
    }
  });

  it('leaves strings, ids and integers untouched', () => {
    const document = documentWith([textElement({ text: 'Thêu tay', fontWeight: 400 })]);
    const quantized = quantizeDesignDocument(document);
    const element = quantized.elements[0];
    expect(element?.id).toBe('text-1');
    expect(quantized.schemaVersion).toBe(1);
    if (element?.type === 'text') {
      expect(element.text).toBe('Thêu tay');
      expect(element.fontWeight).toBe(400);
    }
  });

  it('preserves array order, which is z-order', () => {
    const document = documentWith([textElement({ id: 'b' }), textElement({ id: 'a' })]);
    expect(quantizeDesignDocument(document).elements.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('is idempotent over a whole document', () => {
    const document = documentWith([
      textElement({ opacity: 0.333_333_3, transform: transform({ x: 1.111_119 }) }),
      freehandElement({
        id: 'f',
        points: [
          { x: 0.1 + 0.2, y: 9.876_543 },
          { x: 1, y: 2 },
        ],
      }),
    ]);
    const once = quantizeDesignDocument(document);
    expect(quantizeDesignDocument(once)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const document = documentWith([textElement({ opacity: 0.500_004 })]);
    const before = clone(document);
    quantizeDesignDocument(document);
    expect(document).toEqual(before);
  });
});
