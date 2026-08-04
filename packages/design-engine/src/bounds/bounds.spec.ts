/**
 * Local envelopes and transformed bounds.
 *
 * The case this suite exists for is `APP3-G05-C1`: a stroked rectangle must
 * expand by half its stroke. The delivered G05 ruling expanded only line and
 * freehand, so a rectangle could paint outside its own "conservative" bounds —
 * `rectangle stroke expands the envelope` is the regression.
 *
 * The other one worth reading is `stroke is transformed, not added afterwards`.
 * Under 3× scale a post-transform half-stroke would be charged at 1×, so the
 * bound would be short by exactly the amount that matters most.
 */
import {
  documentWith,
  freehandElement,
  groupElement,
  imageElement,
  shapeElement,
  textElement,
  transform,
} from '../testing/fixtures';
import { isGeometryFinding } from '../transforms/graph';
import type { Bounds2D } from '../geometry/types';
import {
  containsBounds,
  containsPoint,
  getDocumentBounds,
  getElementBounds,
  getGroupBounds,
  intersectBounds,
  unionBounds,
} from './bounds';
import { localEnvelope } from './envelope';

const boundsOf = (document: Parameters<typeof getElementBounds>[0], id: string): Bounds2D => {
  const result = getElementBounds(document, id);
  if (isGeometryFinding(result as never)) throw new Error('unexpected finding');
  return result as Bounds2D;
};

const documentBox = (
  document: Parameters<typeof getDocumentBounds>[0],
  options: Parameters<typeof getDocumentBounds>[1] = {},
): Bounds2D => {
  const result = getDocumentBounds(document, options);
  if (result === undefined || isGeometryFinding(result as never)) {
    throw new Error('unexpected finding');
  }
  return result as Bounds2D;
};

describe('local envelopes', () => {
  it('gives text and image their declared box, unexpanded', () => {
    expect(localEnvelope(textElement())).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    expect(localEnvelope(imageElement())).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it('gives a zero-stroke rectangle its declared box', () => {
    expect(localEnvelope(shapeElement({ strokeWidthPx: 0 }))).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
    });
  });

  it('expands a stroked rectangle by half its stroke', () => {
    // APP3-G05-C1. Before the correction this was the declared box.
    expect(localEnvelope(shapeElement({ strokeWidthPx: 8 }))).toEqual({
      minX: -4,
      minY: -4,
      maxX: 104,
      maxY: 54,
    });
  });

  it('expands a stroked ellipse by half its stroke', () => {
    expect(localEnvelope(shapeElement({ shape: 'ellipse', strokeWidthPx: 6 }))).toEqual({
      minX: -3,
      minY: -3,
      maxX: 103,
      maxY: 53,
    });
  });

  it('runs a line from (0,0) to (width,height) and expands by half its stroke', () => {
    expect(localEnvelope(shapeElement({ shape: 'line', strokeWidthPx: 4 }))).toEqual({
      minX: -2,
      minY: -2,
      maxX: 102,
      maxY: 52,
    });
  });

  it('bounds freehand by its polyline, not its declared box', () => {
    const element = freehandElement({
      strokeWidthPx: 2,
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 5 },
      ],
    });
    expect(localEnvelope(element)).toEqual({ minX: 9, minY: 4, maxX: 31, maxY: 11 });
  });

  it('makes a one-point freehand a round dot of radius half the stroke', () => {
    const element = freehandElement({ strokeWidthPx: 10, points: [{ x: 20, y: 20 }] });
    expect(localEnvelope(element)).toEqual({ minX: 15, minY: 15, maxX: 25, maxY: 25 });
  });

  it('gives a group no envelope of its own', () => {
    expect(localEnvelope(groupElement())).toBeUndefined();
  });

  it('rejects unusable geometry when called directly', () => {
    expect(localEnvelope(shapeElement({ strokeWidthPx: -1 }))).toBeUndefined();
    expect(
      localEnvelope(textElement({ transform: transform({ width: Number.NaN }) })),
    ).toBeUndefined();
    expect(
      localEnvelope(freehandElement({ points: [{ x: Number.POSITIVE_INFINITY, y: 0 }] })),
    ).toBeUndefined();
  });
});

describe('transformed bounds', () => {
  it('translates', () => {
    const document = documentWith([textElement({ transform: transform({ x: 20, y: 30 }) })]);
    expect(boundsOf(document, 'text-1')).toEqual({ minX: 20, minY: 30, maxX: 120, maxY: 80 });
  });

  it('rotates about the local-box centre', () => {
    // A 100×50 box at the origin rotated 90° about its centre (50,25).
    const document = documentWith([textElement({ transform: transform({ rotationDeg: 90 }) })]);
    expect(boundsOf(document, 'text-1')).toEqual({ minX: 25, minY: -25, maxX: 75, maxY: 75 });
  });

  it('scales about the local-box centre', () => {
    const document = documentWith([
      textElement({ transform: transform({ scaleX: 2, scaleY: 2 }) }),
    ]);
    expect(boundsOf(document, 'text-1')).toEqual({ minX: -50, minY: -25, maxX: 150, maxY: 75 });
  });

  it('reflects for a negative scale without inverting the box', () => {
    const document = documentWith([textElement({ transform: transform({ scaleX: -1 }) })]);
    const bounds = boundsOf(document, 'text-1');
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
  });

  it('transforms the stroke rather than adding it afterwards', () => {
    // 3× scale on a 100×50 box with an 8px stroke. Expanded first, the stroke
    // scales too: half-stroke 4 becomes 12 in document space.
    const document = documentWith([
      shapeElement({ strokeWidthPx: 8, transform: transform({ scaleX: 3, scaleY: 3 }) }),
    ]);
    const bounds = boundsOf(document, 'shape-1');
    expect(bounds).toEqual({ minX: -112, minY: -62, maxX: 212, maxY: 112 });
    // Adding an unscaled half-stroke after the transform would have given -104
    // on x and -54 on y: short by exactly the scaled part of the stroke.
    expect(bounds.minX).toBeLessThan(-104);
    expect(bounds.minY).toBeLessThan(-54);
  });

  it('is conservative under non-uniform scale and rotation', () => {
    const document = documentWith([
      shapeElement({
        shape: 'line',
        strokeWidthPx: 4,
        transform: transform({ rotationDeg: 45, scaleX: 2, scaleY: 0.5 }),
      }),
    ]);
    const bounds = boundsOf(document, 'shape-1');
    const plain = boundsOf(
      documentWith([
        shapeElement({
          shape: 'line',
          strokeWidthPx: 0,
          transform: transform({ rotationDeg: 45, scaleX: 2, scaleY: 0.5 }),
        }),
      ]),
      'shape-1',
    );
    expect(bounds.minX).toBeLessThan(plain.minX);
    expect(bounds.maxY).toBeGreaterThan(plain.maxY);
  });

  it('is deterministic across repeated calls', () => {
    const document = documentWith([
      shapeElement({ strokeWidthPx: 3, transform: transform({ rotationDeg: 17.5 }) }),
    ]);
    expect(boundsOf(document, 'shape-1')).toEqual(boundsOf(document, 'shape-1'));
  });
});

describe('group and document bounds', () => {
  const scene = () =>
    documentWith([
      textElement({ transform: transform({ x: 0, y: 0, width: 10, height: 10 }) }),
      shapeElement({
        id: 'shape-1',
        strokeWidthPx: 0,
        transform: transform({ x: 40, y: 40, width: 10, height: 10 }),
      }),
      groupElement({
        transform: transform({ x: 0, y: 0 }),
        childIds: ['text-1', 'shape-1'],
      }),
      imageElement({
        id: 'image-1',
        transform: transform({ x: 200, y: 0, width: 10, height: 10 }),
      }),
    ]);

  it('unions descendant bounds for a group, never its persisted box', () => {
    const group = getGroupBounds(scene(), 'group-1');
    expect(group).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 50 });
  });

  it('does not use the group persisted box as bounds', () => {
    // The group box is 100×50 at the origin; its descendants span only 50×50.
    const group = getGroupBounds(scene(), 'group-1') as Bounds2D;
    expect(group.maxX).toBe(50);
  });

  it('unions every drawable element for the document', () => {
    expect(getDocumentBounds(scene())).toEqual({ minX: 0, minY: 0, maxX: 210, maxY: 50 });
  });

  it('counts hidden and locked elements', () => {
    const document = documentWith([
      textElement({ transform: transform({ width: 10, height: 10 }) }),
      imageElement({
        id: 'image-1',
        visible: false,
        locked: true,
        transform: transform({ x: 500, y: 0, width: 10, height: 10 }),
      }),
    ]);
    expect(documentBox(document).maxX).toBe(510);
  });

  it('excludes hidden elements only when a caller asks explicitly', () => {
    const document = documentWith([
      textElement({ transform: transform({ width: 10, height: 10 }) }),
      imageElement({
        id: 'image-1',
        visible: false,
        transform: transform({ x: 500, y: 0, width: 10, height: 10 }),
      }),
    ]);
    expect(documentBox(document, { visibleOnly: true }).maxX).toBe(10);
  });

  it('does not change with z-order', () => {
    const elements = scene().elements;
    const reversed = documentWith([...elements].reverse());
    expect(getDocumentBounds(reversed)).toEqual(getDocumentBounds(scene()));
  });
});

/**
 * `APP3-P02-C1`. Bounds must not be produced from a graph that has no
 * authoritative parentage — an AABB returned beside a structural finding is the
 * dangerous outcome, because it looks measured.
 */
describe('bounds on an ambiguous graph', () => {
  const contested = () =>
    documentWith([
      textElement({ transform: transform({ width: 10, height: 10 }) }),
      groupElement({ id: 'g1', transform: transform({ x: 5, y: 0 }), childIds: ['text-1'] }),
      groupElement({ id: 'g2', transform: transform({ x: 50, y: 0 }), childIds: ['text-1'] }),
    ]);

  it('fails safely for an element', () => {
    const result = getElementBounds(contested(), 'text-1');
    expect(isGeometryFinding(result as never)).toBe(true);
    expect((result as { code: string }).code).toBe('INVALID_PARENT_CHAIN');
  });

  it('fails safely for a group, rather than unioning what it can reach', () => {
    const result = getGroupBounds(contested(), 'g1');
    expect((result as { code: string }).code).toBe('INVALID_PARENT_CHAIN');
    expect(JSON.stringify(result)).not.toContain('minX');
  });

  it('fails safely for the document, distinguishably from an empty one', () => {
    const result = getDocumentBounds(contested());
    expect((result as { code: string }).code).toBe('INVALID_PARENT_CHAIN');
    expect(getDocumentBounds(documentWith([]))).toBeUndefined();
  });

  it('returns the same finding every time', () => {
    expect(getElementBounds(contested(), 'text-1')).toEqual(
      getElementBounds(contested(), 'text-1'),
    );
  });
});

describe('box helpers', () => {
  const box: Bounds2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('unions and intersects', () => {
    expect(unionBounds(box, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 20,
    });
    expect(intersectBounds(box, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toEqual({
      minX: 5,
      minY: 5,
      maxX: 10,
      maxY: 10,
    });
    expect(intersectBounds(box, { minX: 50, minY: 50, maxX: 60, maxY: 60 })).toBeUndefined();
  });

  it('treats touching as contained', () => {
    expect(containsBounds(box, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
    expect(containsBounds(box, { minX: 0, minY: 0, maxX: 10.0001, maxY: 10 })).toBe(false);
    expect(containsPoint(box, { x: 10, y: 0 })).toBe(true);
    expect(containsPoint(box, { x: 10.0001, y: 0 })).toBe(false);
  });
});
