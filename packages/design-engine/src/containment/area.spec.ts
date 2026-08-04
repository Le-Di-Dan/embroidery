/**
 * Containment and physical-size validation.
 *
 * The stroke-only overhang cases are what `APP3-G05-C1` was written for: a
 * rectangle whose fill sits exactly on the area boundary but whose stroke
 * crosses it must fail. Under the delivered G05 ruling it passed, and the design
 * would have been stitched clipped.
 *
 * Nothing here mutates. Every case that fails asserts the document is unchanged
 * afterwards, because "clamp it into the area" is the tempting fix and PO-09
 * forbids it: a silently nudged element is a design the customer never approved.
 */
import {
  areaAuthority,
  documentWith,
  freehandElement,
  groupElement,
  shapeElement,
  sideAuthority,
  textElement,
  transform,
} from '../testing/fixtures';
import {
  validateDocumentPhysicalSize,
  validateDocumentWithinEmbroideryArea,
  validateElementPhysicalSize,
  validateElementWithinEmbroideryArea,
} from './area';

// The area runs from (100,100) to (500,400).
const AREA = areaAuthority();

const inside = (overrides: Record<string, unknown> = {}) =>
  textElement({ transform: transform({ x: 150, y: 150, width: 100, height: 50 }), ...overrides });

const codesFor = (document: Parameters<typeof validateDocumentWithinEmbroideryArea>[0]) =>
  validateDocumentWithinEmbroideryArea(document, AREA).findings.map((finding) => finding.code);

describe('containment', () => {
  it('accepts an element fully inside', () => {
    expect(validateDocumentWithinEmbroideryArea(documentWith([inside()]), AREA).ok).toBe(true);
  });

  it('accepts an element touching each boundary exactly', () => {
    for (const overrides of [
      { x: 100, y: 150 },
      { y: 100, x: 150 },
      { x: 400, y: 150 },
      { y: 350, x: 150 },
    ]) {
      const element = textElement({
        transform: transform({ width: 100, height: 50, ...overrides }),
      });
      expect(validateDocumentWithinEmbroideryArea(documentWith([element]), AREA).ok).toBe(true);
    }
  });

  it('rejects an element outside each boundary', () => {
    for (const overrides of [
      { x: 99.9999, y: 150 },
      { y: 99.9999, x: 150 },
      { x: 400.0001, y: 150 },
      { y: 350.0001, x: 150 },
    ]) {
      const element = textElement({
        transform: transform({ width: 100, height: 50, ...overrides }),
      });
      expect(codesFor(documentWith([element]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
    }
  });

  it('rejects an element whose rotation pushes it out', () => {
    // Fits axis-aligned at 100×50; rotated 90° it becomes 50×100 about its
    // centre and its top edge crosses the boundary.
    const element = textElement({
      transform: transform({ x: 150, y: 110, width: 100, height: 50, rotationDeg: 90 }),
    });
    expect(validateDocumentWithinEmbroideryArea(documentWith([element]), AREA).ok).toBe(false);
  });

  it('rejects a scaled element that no longer fits', () => {
    const element = textElement({
      transform: transform({ x: 150, y: 150, width: 100, height: 50, scaleX: 8, scaleY: 8 }),
    });
    expect(codesFor(documentWith([element]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });
});

describe('stroke-only overhang', () => {
  it('rejects a rectangle whose fill fits but whose stroke does not', () => {
    // Fill spans exactly x = 100..200 on the boundary; a 4px stroke reaches 98.
    const filled = shapeElement({
      strokeWidthPx: 0,
      transform: transform({ x: 100, y: 150, width: 100, height: 50 }),
    });
    const stroked = shapeElement({
      strokeWidthPx: 4,
      transform: transform({ x: 100, y: 150, width: 100, height: 50 }),
    });
    expect(validateDocumentWithinEmbroideryArea(documentWith([filled]), AREA).ok).toBe(true);
    expect(codesFor(documentWith([stroked]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });

  it('rejects an ellipse whose stroke crosses the boundary', () => {
    const stroked = shapeElement({
      shape: 'ellipse',
      strokeWidthPx: 4,
      transform: transform({ x: 100, y: 150, width: 100, height: 50 }),
    });
    expect(codesFor(documentWith([stroked]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });

  it('rejects a line whose round cap crosses the boundary', () => {
    const line = shapeElement({
      shape: 'line',
      strokeWidthPx: 6,
      transform: transform({ x: 100, y: 150, width: 100, height: 50 }),
    });
    expect(codesFor(documentWith([line]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });

  it('rejects a freehand stroke that crosses the boundary', () => {
    const stroke = freehandElement({
      strokeWidthPx: 8,
      transform: transform({ x: 100, y: 150, width: 100, height: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 20 },
      ],
    });
    expect(codesFor(documentWith([stroke]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });
});

describe('what containment never exempts or changes', () => {
  it('validates hidden and locked elements', () => {
    const hidden = textElement({
      visible: false,
      locked: true,
      transform: transform({ x: 900, y: 900, width: 10, height: 10 }),
    });
    expect(codesFor(documentWith([hidden]))).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });

  it('names the offending descendant, not the group', () => {
    const document = documentWith([
      inside({ id: 'good' }),
      textElement({
        id: 'bad',
        transform: transform({ x: 900, y: 0, width: 10, height: 10 }),
      }),
      groupElement({ childIds: ['good', 'bad'] }),
    ]);
    const findings = validateDocumentWithinEmbroideryArea(document, AREA).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.elementId).toBe('bad');
  });

  it('accounts for the group transform when validating a child', () => {
    // The child fits on its own; the group pushes it outside.
    const document = documentWith([
      textElement({ transform: transform({ x: 150, y: 150, width: 50, height: 50 }) }),
      groupElement({ transform: transform({ x: 1000, y: 0 }), childIds: ['text-1'] }),
    ]);
    expect(codesFor(document)).toEqual(['ELEMENT_OUT_OF_BOUNDS']);
  });

  it('does not clamp, move or otherwise mutate the document', () => {
    const document = documentWith([
      textElement({ transform: transform({ x: 900, y: 900, width: 10, height: 10 }) }),
    ]);
    const before = JSON.parse(JSON.stringify(document)) as unknown;
    validateDocumentWithinEmbroideryArea(document, AREA);
    expect(document).toEqual(before);
  });

  it('carries no storage key, URL or document content in a finding', () => {
    const document = documentWith([
      textElement({ text: 'SECRET-MARKER', transform: transform({ x: 900, y: 900 }) }),
    ]);
    const serialized = JSON.stringify(validateDocumentWithinEmbroideryArea(document, AREA));
    expect(serialized).not.toContain('SECRET-MARKER');
    expect(serialized).not.toContain('http');
  });
});

/**
 * `APP3-P02-C1`. Containment decides whether a design may be stitched, so an
 * ambiguous graph must not reach a verdict at all: an `ok: true` computed from
 * an arbitrarily chosen parent would approve a placement nobody chose.
 */
describe('validation on an ambiguous graph', () => {
  const contested = () =>
    documentWith([
      inside(),
      groupElement({ id: 'g1', transform: transform({ x: 0, y: 0 }), childIds: ['text-1'] }),
      groupElement({ id: 'g2', transform: transform({ x: 900, y: 0 }), childIds: ['text-1'] }),
    ]);

  it('fails containment safely and names the contested child', () => {
    // Under g1 the element fits and under g2 it does not; neither is authority.
    const result = validateDocumentWithinEmbroideryArea(contested(), AREA);
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(['INVALID_PARENT_CHAIN']);
    expect(result.findings[0]?.elementId).toBe('text-1');
  });

  it('fails element containment safely', () => {
    const result = validateElementWithinEmbroideryArea(contested(), 'text-1', AREA);
    expect(result.findings[0]?.code).toBe('INVALID_PARENT_CHAIN');
  });

  it('fails physical-size validation safely', () => {
    expect(
      validateElementPhysicalSize(contested(), 'text-1', sideAuthority(), AREA).findings[0]?.code,
    ).toBe('INVALID_PARENT_CHAIN');
    expect(
      validateDocumentPhysicalSize(contested(), sideAuthority(), AREA).findings.map(
        (finding) => finding.code,
      ),
    ).toEqual(['INVALID_PARENT_CHAIN']);
  });

  it('reports the ambiguity once, not once per element', () => {
    const document = documentWith([
      inside(),
      shapeElement({ id: 'shape-1', strokeWidthPx: 0 }),
      groupElement({ id: 'g1', childIds: ['text-1'] }),
      groupElement({ id: 'g2', childIds: ['text-1'] }),
    ]);
    expect(validateDocumentWithinEmbroideryArea(document, AREA).findings).toHaveLength(1);
  });

  it('does not mutate the document and stays deterministic', () => {
    const document = contested();
    const before = JSON.parse(JSON.stringify(document)) as unknown;
    const first = validateDocumentWithinEmbroideryArea(document, AREA);
    const second = validateDocumentWithinEmbroideryArea(document, AREA);
    expect(document).toEqual(before);
    expect(first).toEqual(second);
  });
});

describe('physical size', () => {
  const SIDE = sideAuthority(); // 5 px per mm; the area allows 80 × 60 mm.

  const sized = (width: number, height: number) =>
    documentWith([textElement({ transform: transform({ x: 150, y: 150, width, height }) })]);

  it('accepts a size exactly at each maximum', () => {
    // 400px / 5 = 80mm wide, 300px / 5 = 60mm tall.
    expect(validateElementPhysicalSize(sized(400, 300), 'text-1', SIDE, AREA).ok).toBe(true);
  });

  it('rejects one quantized unit over the width maximum', () => {
    const result = validateElementPhysicalSize(sized(400.0005, 300), 'text-1', SIDE, AREA);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      'ELEMENT_PHYSICAL_SIZE_EXCEEDED',
    ]);
  });

  it('rejects one quantized unit over the height maximum', () => {
    const result = validateElementPhysicalSize(sized(400, 300.0005), 'text-1', SIDE, AREA);
    expect(result.findings[0]?.message).toContain('taller');
  });

  it('measures the stroke-aware bounds, not the declared box', () => {
    // A 400×300 box is exactly at the maximum; a 4px stroke pushes it over.
    const stroked = documentWith([
      shapeElement({
        strokeWidthPx: 4,
        transform: transform({ x: 150, y: 150, width: 400, height: 300 }),
      }),
    ]);
    expect(validateElementPhysicalSize(stroked, 'shape-1', SIDE, AREA).ok).toBe(false);
  });

  it('uses Product Side pxPerMm, never an area-derived ratio', () => {
    // Halving the scale halves the millimetres, so what was at the limit fits.
    const generous = sideAuthority({ pxPerMm: 10, physicalWidthMm: 100, physicalHeightMm: 100 });
    expect(validateElementPhysicalSize(sized(600, 400), 'text-1', generous, AREA).ok).toBe(true);
  });

  it('rejects a non-positive scale rather than dividing by it', () => {
    const broken = sideAuthority({ pxPerMm: 0 });
    expect(
      validateElementPhysicalSize(sized(10, 10), 'text-1', broken, AREA).findings[0]?.code,
    ).toBe('PX_PER_MM_MISMATCH');
  });

  it('validates every drawable element of a document', () => {
    const document = documentWith([
      textElement({ transform: transform({ x: 150, y: 150, width: 10, height: 10 }) }),
      shapeElement({
        id: 'shape-1',
        strokeWidthPx: 0,
        transform: transform({ x: 150, y: 150, width: 4000, height: 10 }),
      }),
    ]);
    const findings = validateDocumentPhysicalSize(document, SIDE, AREA).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.elementId).toBe('shape-1');
  });

  it('infers nothing about stitch feasibility', () => {
    const serialized = JSON.stringify(
      validateElementPhysicalSize(sized(4000, 300), 'text-1', SIDE, AREA),
    );
    expect(serialized).not.toContain('stitch');
    expect(serialized).not.toContain('density');
  });
});
