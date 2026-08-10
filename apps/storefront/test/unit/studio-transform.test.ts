/**
 * The transform candidates (`APP3-S03`).
 *
 * Every assertion here is made against **the engine's own answer**, never a
 * transcribed constant. A test that carried its own copy of "rotate about the
 * untransformed local-box centre, scale first, compose parent-outermost" would
 * pass while agreeing with a candidate module that had drifted from `IMP-D045`
 * — both wrong, identically. So a move is checked by asking `APP3-P02` where the
 * element ended up, a resize by asking it how large the element became, and a
 * rotation by asking it where a corner went.
 */
import {
  buildElementGraph,
  getElementBounds,
  boundsSize,
  transformPoint,
  type Bounds2D,
} from '@embroidery/design-engine';
import type { DesignDocument, DesignElementTransform } from '@embroidery/design-document';

import {
  elementFrames,
  moveCandidate,
  resizeCandidate,
  rotateCandidate,
  rotationAnchors,
} from '../../src/features/design-studio/model/studio-transform';
import { RESIZE_HANDLES } from '../../src/features/design-studio/model/studio-transform-handles';
import { withTransform } from '../../src/features/design-studio/model/studio-transform-authority';
import { groupElement, makeStageDocument, shapeElement } from '../support/studio-stage-fixture';

const AT = (overrides: Partial<DesignElementTransform> = {}) => ({
  x: 100,
  y: 100,
  width: 40,
  height: 20,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  ...overrides,
});

function framesFor(document: DesignDocument, id: string) {
  const frames = elementFrames(buildElementGraph(document), id);
  if (frames === undefined) throw new Error(`no frames for ${id}`);
  return frames;
}

function boundsOf(document: DesignDocument, id: string): Bounds2D {
  return getElementBounds(document, id, buildElementGraph(document)) as Bounds2D;
}

/** Where a local-box corner actually lands, asked of the engine. */
function cornerOf(document: DesignDocument, id: string) {
  const frames = framesFor(document, id);
  return transformPoint(frames.effective, { x: 0, y: 0 });
}

describe('move is expressed in the parent frame', () => {
  it('moves a root element by exactly the document delta', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');

    const moved = moveCandidate(AT(), frames, { x: 12, y: -7 });

    expect(moved).toEqual(AT({ x: 112, y: 93 }));
  });

  it('shifts the engine-measured bounds by the delta and nothing else', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT({ rotationDeg: 30 }) })]);
    const before = boundsOf(document, 'a');

    const moved = moveCandidate(AT({ rotationDeg: 30 }), framesFor(document, 'a'), { x: 10, y: 5 });
    const after = boundsOf(withTransform(document, 'a', moved!), 'a');

    expect(after.minX - before.minX).toBeCloseTo(10, 9);
    expect(after.minY - before.minY).toBeCloseTo(5, 9);
    expect(boundsSize(after).width).toBeCloseTo(boundsSize(before).width, 9);
  });

  it('moves a grouped child through the inverse parent transform, not by raw pixels', () => {
    // The group is rotated a quarter turn, so a document-space drag to the right
    // is a drag *down* in the child's own frame. Adding the delta straight to
    // `x`/`y` would look plausible and be wrong by exactly this rotation.
    const child = shapeElement('child', { transform: AT({ x: 10, y: 10 }) });
    const group = groupElement('g', ['child'], {
      transform: AT({ x: 100, y: 100, width: 200, height: 200, rotationDeg: 90 }),
    });
    const document = makeStageDocument([group, child]);

    const moved = moveCandidate(child.transform, framesFor(document, 'child'), { x: 20, y: 0 });

    expect(moved?.x).toBeCloseTo(10, 9);
    expect(moved?.y).toBeCloseTo(-10, 9);
    // And the element really does end up 20 document pixels to the right.
    const after = cornerOf(withTransform(document, 'child', moved!), 'child');
    const before = cornerOf(document, 'child');
    expect(after.x - before.x).toBeCloseTo(20, 9);
    expect(after.y - before.y).toBeCloseTo(0, 9);
  });

  it('does not accumulate drift over a round trip', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');

    let transform = AT();
    for (const delta of [
      { x: 13.7, y: -4.2 },
      { x: -13.7, y: 4.2 },
    ]) {
      // Each step is computed from the *frozen* start, which is what the
      // gesture does; the second returns the element exactly.
      transform = moveCandidate(AT(), frames, delta) ?? transform;
    }
    const back = moveCandidate(AT(), frames, { x: 0, y: 0 });

    expect(back).toEqual(AT());
  });
});

describe('resize persists scale about the local-box centre', () => {
  it('leaves x, y, width and height untouched for every handle', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');

    for (const handle of RESIZE_HANDLES) {
      const resized = resizeCandidate(AT(), frames, handle, { x: 6, y: 6 });
      expect(resized?.x).toBe(100);
      expect(resized?.y).toBe(100);
      expect(resized?.width).toBe(40);
      expect(resized?.height).toBe(20);
    }
  });

  it('drives only the axes its handle is off-centre on', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');

    const east = resizeCandidate(AT(), frames, 'e', { x: 10, y: 10 });
    expect(east?.scaleY).toBe(1);
    expect(east?.scaleX).toBeGreaterThan(1);

    const south = resizeCandidate(AT(), frames, 's', { x: 10, y: 10 });
    expect(south?.scaleX).toBe(1);
    expect(south?.scaleY).toBeGreaterThan(1);
  });

  it('puts the dragged corner where the pointer took it', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');
    const before = boundsOf(document, 'a');

    // The `se` handle is at (width, height) and its centre offset is half the
    // width, so dragging it 20 right doubles `scaleX`. The assertions are on the
    // invariants rather than on a hand-computed edge position: the engine also
    // scales the **stroke envelope** (PO-08), so the measured bounds grow by
    // more than the box does, and a transcribed number would be asserting that
    // the stroke is ignored.
    const resized = resizeCandidate(AT(), frames, 'se', { x: 20, y: 0 });
    const after = boundsOf(withTransform(document, 'a', resized!), 'a');

    expect(resized?.scaleX).toBeCloseTo(2, 9);
    expect(boundsSize(after).width).toBeCloseTo(boundsSize(before).width * 2, 6);
    // Symmetric about the centre, which is what "the pivot is the centre" means.
    expect(after.maxX - before.maxX).toBeCloseTo(before.minX - after.minX, 6);
  });

  it('keeps the centre fixed, which is the pivot IMP-D045 PO-04 locks', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT({ rotationDeg: 25 }) })]);
    const frames = framesFor(document, 'a');
    const before = rotationAnchors(AT({ rotationDeg: 25 }), frames).pivot;

    const resized = resizeCandidate(AT({ rotationDeg: 25 }), frames, 'nw', { x: -9, y: -3 });
    const after = rotationAnchors(
      resized!,
      framesFor(withTransform(document, 'a', resized!), 'a'),
    ).pivot;

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('resizes correctly through a rotated parent', () => {
    const child = shapeElement('child', { transform: AT({ x: 10, y: 10 }) });
    const group = groupElement('g', ['child'], {
      transform: AT({ x: 0, y: 0, width: 200, height: 200, rotationDeg: 90 }),
    });
    const document = makeStageDocument([group, child]);
    const frames = framesFor(document, 'child');

    // Dragging `e` in *document* space is dragging the child's own bottom edge,
    // because the group turned it a quarter turn.
    const resized = resizeCandidate(child.transform, frames, 'e', { x: 0, y: 16 });

    expect(resized?.scaleX).toBeGreaterThan(1);
    expect(resized?.scaleY).toBe(1);
  });

  it('returns no candidate when the frame cannot be inverted', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');
    const singular = { ...frames, preScale: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 } };

    expect(resizeCandidate(AT(), singular, 'se', { x: 5, y: 5 })).toBeUndefined();
  });
});

describe('rotation turns clockwise about the untransformed centre', () => {
  it('leaves every other persisted field alone', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');
    const { pivot, grab } = rotationAnchors(AT(), frames);
    const startVector = { x: grab.x - pivot.x, y: grab.y - pivot.y };

    const rotated = rotateCandidate(AT(), startVector, { x: 30, y: 30 });

    expect(rotated).toMatchObject({ x: 100, y: 100, width: 40, height: 20, scaleX: 1, scaleY: 1 });
    expect(rotated?.rotationDeg).not.toBe(0);
  });

  it('is positive clockwise under a y-down axis', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');
    const { pivot, grab } = rotationAnchors(AT(), frames);
    const startVector = { x: grab.x - pivot.x, y: grab.y - pivot.y };

    // The grab starts straight above the centre. Dragging it to the right is a
    // clockwise turn on screen, so `rotationDeg` must increase (PO-03).
    const rotated = rotateCandidate(AT(), startVector, { x: 10, y: 0 });

    expect(rotated?.rotationDeg).toBeGreaterThan(0);
  });

  it('keeps the pivot exactly where it was', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    const frames = framesFor(document, 'a');
    const { pivot, grab } = rotationAnchors(AT(), frames);
    const startVector = { x: grab.x - pivot.x, y: grab.y - pivot.y };

    const rotated = rotateCandidate(AT(), startVector, { x: 14, y: 9 })!;
    const after = rotationAnchors(rotated, framesFor(withTransform(document, 'a', rotated), 'a'));

    expect(after.pivot.x).toBeCloseTo(pivot.x, 9);
    expect(after.pivot.y).toBeCloseTo(pivot.y, 9);
  });

  it('returns exactly the starting angle when the pointer has not moved', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT({ rotationDeg: 37 }) })]);
    const frames = framesFor(document, 'a');
    const { pivot, grab } = rotationAnchors(AT({ rotationDeg: 37 }), frames);

    const rotated = rotateCandidate(
      AT({ rotationDeg: 37 }),
      { x: grab.x - pivot.x, y: grab.y - pivot.y },
      { x: 0, y: 0 },
    );

    expect(rotated?.rotationDeg).toBe(37);
  });

  it('refuses a degenerate start vector rather than producing NaN', () => {
    expect(rotateCandidate(AT(), { x: 0, y: 0 }, { x: 5, y: 5 })).toBeUndefined();
  });
});

describe('the frames come from the engine, or not at all', () => {
  it('gives a root element the identity parent frame', () => {
    const document = makeStageDocument([shapeElement('a', { transform: AT() })]);
    expect(framesFor(document, 'a').parent).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('gives a grouped child its group as the parent frame', () => {
    const child = shapeElement('child', { transform: AT() });
    const group = groupElement('g', ['child'], { transform: AT({ x: 5, y: 9 }) });
    const document = makeStageDocument([group, child]);

    expect(framesFor(document, 'child').parent).not.toEqual(framesFor(document, 'g').parent);
  });

  it('answers with no frames at all for an unresolvable graph', () => {
    const document = makeStageDocument([
      groupElement('g1', ['shared']),
      groupElement('g2', ['shared']),
      shapeElement('shared'),
    ]);

    expect(elementFrames(buildElementGraph(document), 'shared')).toBeUndefined();
  });
});
