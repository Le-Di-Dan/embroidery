/**
 * Structural reuse in the scene adapter (`APP3-S03-C1`).
 *
 * The failure this exists to catch is the one that makes a performance fix
 * dangerous: a reused answer that is no longer true. Reusing by element id
 * alone would be exactly that — an element inside a group the customer just
 * dragged has an unchanged record and a changed position, and a stage that kept
 * its previous placement would paint the group's children behind the group.
 *
 * So every test below asserts on **identity** — which object came back — because
 * identity is what the renderer skips work on, and on the geometry, because a
 * reused instance is only correct if it is also the answer a full rebuild would
 * have produced.
 */
import { buildElementGraph } from '@embroidery/design-engine';
import type { DesignDocument } from '@embroidery/design-document';

import {
  shareDocumentIdentity,
  unchangedElementIds,
} from '../../src/features/design-studio/renderer/studio-scene-identity';
import {
  buildRenderableScene,
  type StudioSceneMemo,
} from '../../src/features/design-studio/renderer/studio-scene';
import { groupElement, makeStageDocument, shapeElement } from '../support/studio-stage-fixture';

/** A whole transform, so a fixture never leans on a partial one. */
function box(x: number, y: number, width: number, height: number) {
  return { x, y, width, height, rotationDeg: 0, scaleX: 1, scaleY: 1 };
}

/** A deep copy, so nothing in a test shares an instance by accident. */
function clone(document: DesignDocument): DesignDocument {
  return JSON.parse(JSON.stringify(document)) as DesignDocument;
}

function moved(document: DesignDocument, id: string, dx: number): DesignDocument {
  const next = clone(document);
  return {
    ...next,
    elements: next.elements.map((element) =>
      element.id === id
        ? { ...element, transform: { ...element.transform, x: element.transform.x + dx } }
        : element,
    ),
  };
}

function ok(result: ReturnType<typeof buildRenderableScene>) {
  if (!result.ok) throw new Error(`expected a scene, got ${result.failure}`);
  return result;
}

function memoOf(result: ReturnType<typeof buildRenderableScene>): StudioSceneMemo {
  const built = ok(result);
  return { document: built.document, scene: built.scene };
}

const flat = makeStageDocument([
  shapeElement('a', { transform: box(10, 10, 40, 20) }),
  shapeElement('b', { transform: box(100, 10, 40, 20) }),
  shapeElement('c', { transform: box(200, 10, 40, 20) }),
]);

const grouped = makeStageDocument([
  groupElement('g', ['child']),
  shapeElement('child', { transform: box(10, 10, 40, 20) }),
  shapeElement('loner', { transform: box(200, 10, 40, 20) }),
]);

describe('shareDocumentIdentity', () => {
  it('returns the previous document when nothing changed at all', () => {
    const previous = clone(flat);
    expect(shareDocumentIdentity(previous, clone(flat))).toBe(previous);
  });

  it('keeps the instance of every element that did not change', () => {
    const previous = clone(flat);
    const shared = shareDocumentIdentity(previous, moved(flat, 'b', 5));

    expect(shared).not.toBe(previous);
    expect(shared.elements[0]).toBe(previous.elements[0]);
    expect(shared.elements[2]).toBe(previous.elements[2]);
    expect(shared.elements[1]).not.toBe(previous.elements[1]);
    expect(shared.elements[1]?.transform.x).toBe(105);
  });

  it('is value-identical to the document it was given, always', () => {
    const shared = shareDocumentIdentity(clone(flat), moved(flat, 'b', 5));
    expect(shared).toStrictEqual(moved(flat, 'b', 5));
  });

  it('treats a reorder as a change even though every value is equal', () => {
    const previous = clone(flat);
    const reordered = clone(flat);
    const elements = [...reordered.elements];
    elements.reverse();
    const shared = shareDocumentIdentity(previous, { ...reordered, elements });

    // Paint order is z-order, so the array must be the new one …
    expect(shared).not.toBe(previous);
    expect(shared.elements.map((element) => element.id)).toEqual(['c', 'b', 'a']);
    // … while the elements themselves are still the same instances.
    expect(shared.elements[0]).toBe(previous.elements[2]);
  });

  it('shares nothing when the placement canvas changed', () => {
    const previous = clone(flat);
    const next = { ...clone(flat), placement: { ...flat.placement, canvasWidthPx: 1200 } };
    const shared = shareDocumentIdentity(previous, next);

    expect(shared).toBe(next);
    expect(shared.elements[0]).not.toBe(previous.elements[0]);
  });

  it('does not reuse an element whose visibility, lock or kind changed', () => {
    const previous = clone(flat);
    for (const change of [{ visible: false }, { locked: true }, { opacity: 0.5 }]) {
      const next = clone(flat);
      const elements = next.elements.map((element) =>
        element.id === 'a' ? { ...element, ...change } : element,
      );
      const shared = shareDocumentIdentity(previous, { ...next, elements });
      expect(shared.elements[0]).not.toBe(previous.elements[0]);
      expect(shared.elements[1]).toBe(previous.elements[1]);
    }
  });
});

describe('unchangedElementIds', () => {
  it('is empty without a previous document', () => {
    const document = clone(flat);
    expect(unchangedElementIds(null, document, buildElementGraph(document)).size).toBe(0);
  });

  it('names every element but the one that changed', () => {
    const previous = clone(flat);
    const next = shareDocumentIdentity(previous, moved(flat, 'b', 5));
    const unchanged = unchangedElementIds(previous, next, buildElementGraph(next));

    expect([...unchanged].sort()).toEqual(['a', 'c']);
  });

  it('excludes a descendant of a group that moved, whose own record is untouched', () => {
    const previous = clone(grouped);
    const next = shareDocumentIdentity(previous, moved(grouped, 'g', 25));
    const child = next.elements.find((element) => element.id === 'child');

    // The child's own record really is the same instance …
    expect(child).toBe(previous.elements.find((element) => element.id === 'child'));
    // … and it is still not reusable, because its ancestor moved.
    const unchanged = unchangedElementIds(previous, next, buildElementGraph(next));
    expect(unchanged.has('child')).toBe(false);
    expect(unchanged.has('g')).toBe(false);
    expect(unchanged.has('loner')).toBe(true);
  });
});

describe('buildRenderableScene with a previous build', () => {
  it('returns the same placed instance for an element nothing touched', () => {
    const first = memoOf(buildRenderableScene(clone(flat)));
    const second = ok(buildRenderableScene(moved(flat, 'b', 5), first));

    const before = new Map(first.scene.elements.map((r) => [r.id, r]));
    expect(second.scene.elements[0]).toBe(before.get('a'));
    expect(second.scene.elements[2]).toBe(before.get('c'));
    expect(second.scene.elements[1]).not.toBe(before.get('b'));
  });

  it('gives the changed element the geometry a full rebuild would have', () => {
    const first = memoOf(buildRenderableScene(clone(flat)));
    const reused = ok(buildRenderableScene(moved(flat, 'b', 5), first));
    const cold = ok(buildRenderableScene(moved(flat, 'b', 5)));

    expect(reused.scene).toStrictEqual(cold.scene);
  });

  it('re-places a group descendant even though its own record is unchanged', () => {
    const first = memoOf(buildRenderableScene(clone(grouped)));
    const reused = ok(buildRenderableScene(moved(grouped, 'g', 25), first));
    const cold = ok(buildRenderableScene(moved(grouped, 'g', 25)));

    const child = reused.scene.elements.find((r) => r.id === 'child');
    const stale = first.scene.elements.find((r) => r.id === 'child');
    expect(child).not.toBe(stale);
    expect(child?.matrix).not.toStrictEqual(stale?.matrix);
    expect(reused.scene).toStrictEqual(cold.scene);
  });

  it('leaves an unrelated subtree reusable when a group moves', () => {
    const first = memoOf(buildRenderableScene(clone(grouped)));
    const reused = ok(buildRenderableScene(moved(grouped, 'g', 25), first));

    expect(reused.scene.elements.find((r) => r.id === 'loner')).toBe(
      first.scene.elements.find((r) => r.id === 'loner'),
    );
  });

  it('preserves canonical paint order when elements are reordered', () => {
    const first = memoOf(buildRenderableScene(clone(flat)));
    const reordered = clone(flat);
    const elements = [...reordered.elements];
    elements.reverse();
    const second = ok(buildRenderableScene({ ...reordered, elements }, first));

    expect(second.scene.elements.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('refuses an unreadable document rather than falling back to the previous scene', () => {
    const first = memoOf(buildRenderableScene(clone(flat)));
    const result = buildRenderableScene({ schemaVersion: 1, elements: [] }, first);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('unreadable-document');
  });
});
