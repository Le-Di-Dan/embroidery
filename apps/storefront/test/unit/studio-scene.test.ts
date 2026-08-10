/**
 * The renderer adapter (`APP3-S02`).
 *
 * These prove the properties a stage cannot prove by looking right: that the
 * numbers on screen are `APP3-P02`'s and not a second implementation's, that
 * document order survives into paint order, that a document this build cannot
 * read yields a refusal rather than a guess, and that nothing the adapter
 * touches is mutated.
 *
 * The geometry assertions are made against the engine's own answers rather than
 * against transcribed constants. A test carrying its own copy of "rotate about
 * the untransformed local-box centre, scale first" would pass while agreeing
 * with a renderer that had drifted from `IMP-D045` — both wrong, in the same
 * way, for the same reason.
 */
import {
  buildElementGraph,
  getElementBounds,
  isGeometryFinding,
  localMatrix,
  resolveEffectiveTransform,
  type Bounds2D,
} from '@embroidery/design-engine';

import {
  buildRenderableScene,
  isSelectable,
  resolveElementBounds,
  resolveRenderableElement,
} from '../../src/features/design-studio/renderer/studio-scene';
import { toSvgMatrix } from '../../src/features/design-studio/renderer/studio-svg-matrix';
import {
  CANVAS_HEIGHT_PX,
  CANVAS_WIDTH_PX,
  freehandElement,
  groupElement,
  imageElement,
  makeStageDocument,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry at index ${String(index)}`);
  return item;
}

function sceneOf(document: unknown) {
  const result = buildRenderableScene(document);
  if (!result.ok) throw new Error(`expected a scene, got ${result.failure}`);
  return result.scene;
}

describe('the document boundary (APP3-P01 authority)', () => {
  it('takes the placement canvas as the SVG coordinate system', () => {
    const scene = sceneOf(makeStageDocument([shapeElement('a')]));

    expect(scene.canvasWidthPx).toBe(CANVAS_WIDTH_PX);
    expect(scene.canvasHeightPx).toBe(CANVAS_HEIGHT_PX);
  });

  it('refuses a document whose schema version this build cannot read', () => {
    const document = { ...makeStageDocument([shapeElement('a')]), schemaVersion: 99 };

    expect(buildRenderableScene(document)).toEqual({
      ok: false,
      failure: 'unreadable-document',
    });
  });

  it('refuses a malformed payload rather than repairing it', () => {
    expect(buildRenderableScene({ schemaVersion: 1 })).toEqual({
      ok: false,
      failure: 'unreadable-document',
    });
    expect(buildRenderableScene(null)).toEqual({ ok: false, failure: 'unreadable-document' });
  });

  it('never mutates the document it was given', () => {
    const document = makeStageDocument([shapeElement('a'), textElement('b')]);
    const before = JSON.stringify(document);

    buildRenderableScene(document);

    expect(JSON.stringify(document)).toBe(before);
  });
});

describe('paint order', () => {
  it('preserves the document array order, bottom first', () => {
    const scene = sceneOf(
      makeStageDocument([shapeElement('bottom'), textElement('middle'), shapeElement('top')]),
    );

    expect(scene.elements.map((element) => element.id)).toEqual(['bottom', 'middle', 'top']);
  });

  it('drops groups from the paint list, because a group paints nothing', () => {
    const scene = sceneOf(
      makeStageDocument([shapeElement('child'), groupElement('group', ['child'])]),
    );

    expect(scene.elements.map((element) => element.id)).toEqual(['child']);
  });
});

describe('geometry comes from APP3-P02 and nowhere else', () => {
  it('uses the engine effective matrix for a transformed element', () => {
    const element = shapeElement('rotated', {
      transform: { x: 120, y: 40, width: 80, height: 60, rotationDeg: 30, scaleX: 2, scaleY: 1.5 },
    });
    const document = makeStageDocument([element]);
    const scene = sceneOf(document);

    const expected = localMatrix(element.transform);
    expect(nth(scene.elements, 0).matrix).toEqual(expected);
    expect(nth(scene.elements, 0).transform).toBe(toSvgMatrix(expected));
  });

  it('inherits a group transform through the engine, not through nesting', () => {
    const child = shapeElement('child', {
      transform: { x: 10, y: 10, width: 40, height: 40, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    });
    const group = groupElement('group', ['child'], {
      transform: { x: 200, y: 100, width: 300, height: 300, rotationDeg: 45, scaleX: 1, scaleY: 1 },
    });
    const document = makeStageDocument([child, group]);

    const graph = buildElementGraph(document);
    const resolved = resolveEffectiveTransform(graph, 'child');
    if (isGeometryFinding(resolved)) throw new Error('the fixture graph must resolve');

    expect(nth(sceneOf(document).elements, 0).matrix).toEqual(resolved.matrix);
  });

  it('uses the engine stroke-aware bounds for the selection outline', () => {
    const element = shapeElement('stroked', { strokeWidthPx: 10 });
    const document = makeStageDocument([element]);
    const expected = getElementBounds(document, 'stroked');
    if (isGeometryFinding(expected as never)) throw new Error('the fixture must measure');

    expect(nth(sceneOf(document).elements, 0).bounds).toEqual(expected as Bounds2D);
  });

  it('serializes a matrix in SVG order and changes nothing about it', () => {
    expect(toSvgMatrix({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toBe('matrix(1 2 3 4 5 6)');
  });
});

describe('a graph the engine refuses', () => {
  it('fails the whole scene when two groups claim the same child', () => {
    const document = makeStageDocument([
      shapeElement('child'),
      groupElement('one', ['child']),
      groupElement('two', ['child']),
    ]);

    // P01 rejects the contested parentage before P02 is even asked, which is
    // the stronger of the two refusals — either way nothing is drawn.
    expect(buildRenderableScene(document).ok).toBe(false);
  });

  it('fails the whole scene rather than drawing an element at the identity', () => {
    const document = makeStageDocument([
      shapeElement('a'),
      shapeElement('broken', {
        transform: {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotationDeg: 0,
          scaleX: Number.NaN,
          scaleY: 1,
        },
      }),
    ]);

    const result = buildRenderableScene(document);
    expect(result.ok).toBe(false);
    // The healthy sibling is not drawn either: a design missing a part is
    // indistinguishable from a design that never had one.
    if (!result.ok) expect(result.failure).not.toBe('uncontrolled-font');
  });
});

describe('the controlled font registry (IMP-D044 PO-10)', () => {
  it('resolves a text element to its registered family', () => {
    const scene = sceneOf(makeStageDocument([textElement('t')]));

    expect(nth(scene.elements, 0).fontFamily).toBe('Inter');
  });

  it('refuses a document naming a font outside the registry', () => {
    const document = makeStageDocument([textElement('t', { fontId: 'comic-sans' })]);

    expect(buildRenderableScene(document)).toEqual({ ok: false, failure: 'uncontrolled-font' });
  });

  it('leaves every non-text kind without a family', () => {
    const scene = sceneOf(
      makeStageDocument([shapeElement('s'), imageElement('i'), freehandElement('f')]),
    );

    expect(scene.elements.map((element) => element.fontFamily)).toEqual([null, null, null]);
  });
});

describe('visibility and selection', () => {
  it('keeps a hidden element in the scene but not selectable', () => {
    const scene = sceneOf(
      makeStageDocument([shapeElement('shown'), shapeElement('hidden', { visible: false })]),
    );

    expect(scene.elements.map((element) => element.id)).toEqual(['shown', 'hidden']);
    expect(isSelectable(nth(scene.elements, 0))).toBe(true);
    expect(isSelectable(nth(scene.elements, 1))).toBe(false);
  });

  it('resolves bounds for a selected element and nothing for an unknown id', () => {
    const scene = sceneOf(makeStageDocument([shapeElement('a')]));

    expect(resolveElementBounds(scene, 'a')).toEqual(nth(scene.elements, 0).bounds);
    expect(resolveElementBounds(scene, 'gone')).toBeNull();
    expect(resolveElementBounds(scene, null)).toBeNull();
    expect(resolveRenderableElement(scene, 'gone')).toBeUndefined();
  });

  it('carries no selection of its own — the scene is a drawing, not a state', () => {
    const scene = sceneOf(makeStageDocument([shapeElement('a')]));

    expect(JSON.stringify(scene)).not.toContain('selected');
  });
});
