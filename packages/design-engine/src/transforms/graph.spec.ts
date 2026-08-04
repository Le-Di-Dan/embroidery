/**
 * Group semantics and effective transforms.
 *
 * The composition-order case is the one to read: with `parent × child` a group
 * offset by (10,10) containing a child at local (0,0) puts the child at (10,10);
 * with `child × parent` the child's own rotation would be applied to the group's
 * translation and the element would land somewhere neither transform describes.
 *
 * The cycle case exists because this package is callable directly. P01 rejects
 * cyclic groups, but a caller who skips it must get a typed finding, not a stack
 * overflow.
 */
import {
  documentWith,
  freehandElement,
  groupElement,
  nestedGroups,
  shapeElement,
  textElement,
  transform,
} from '../testing/fixtures';
import { transformPoint } from '../geometry/matrix';
import { quantize } from '../geometry/quantized';
import {
  buildElementGraph,
  drawableDescendants,
  drawableElements,
  isGeometryFinding,
  parentChain,
  resolveEffectiveTransform,
} from './graph';

const at = (document: Parameters<typeof buildElementGraph>[0], id: string) => {
  const resolved = resolveEffectiveTransform(buildElementGraph(document), id);
  if (isGeometryFinding(resolved)) throw new Error(`unexpected finding: ${resolved.code}`);
  return (point: { x: number; y: number }) => {
    const moved = transformPoint(resolved.matrix, point);
    return { x: quantize(moved.x), y: quantize(moved.y) };
  };
};

describe('root elements', () => {
  it('use document space directly', () => {
    const document = documentWith([textElement({ transform: transform({ x: 12, y: 8 }) })]);
    expect(at(document, 'text-1')({ x: 0, y: 0 })).toEqual({ x: 12, y: 8 });
  });

  it('have no ancestors', () => {
    const graph = buildElementGraph(documentWith([textElement()]));
    expect(parentChain(graph, 'text-1')).toEqual([]);
  });
});

describe('group-local child coordinates', () => {
  it('offsets a child by its parent group', () => {
    const document = documentWith([
      textElement({ transform: transform({ x: 0, y: 0 }) }),
      groupElement({ transform: transform({ x: 10, y: 20 }), childIds: ['text-1'] }),
    ]);
    expect(at(document, 'text-1')({ x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });

  it('composes parent outermost, not child outermost', () => {
    // The group rotates 90° about its own centre; the child sits at group-local
    // (0,0). Under child × parent the result would not be this point.
    const document = documentWith([
      textElement({ transform: transform({ x: 0, y: 0, width: 10, height: 10 }) }),
      groupElement({
        transform: transform({ x: 0, y: 0, width: 100, height: 50, rotationDeg: 90 }),
        childIds: ['text-1'],
      }),
    ]);
    expect(at(document, 'text-1')({ x: 0, y: 0 })).toEqual({ x: 75, y: -25 });
  });

  it('accumulates through nested groups to the ruled depth', () => {
    const document = documentWith(nestedGroups(8, 10));
    // Eight groups each offset by (10,10): the leaf lands at (80,80).
    expect(at(document, 'leaf')({ x: 0, y: 0 })).toEqual({ x: 80, y: 80 });
    expect(parentChain(buildElementGraph(document), 'leaf')).toHaveLength(8);
  });

  it('is deterministic regardless of element array order', () => {
    const child = textElement({ transform: transform({ x: 1, y: 2 }) });
    const group = groupElement({ transform: transform({ x: 10, y: 10 }), childIds: ['text-1'] });
    const forward = at(documentWith([child, group]), 'text-1')({ x: 0, y: 0 });
    const reversed = at(documentWith([group, child]), 'text-1')({ x: 0, y: 0 });
    expect(forward).toEqual(reversed);
  });
});

describe('safe failure when called directly', () => {
  it('reports an unknown element', () => {
    const graph = buildElementGraph(documentWith([textElement()]));
    const resolved = resolveEffectiveTransform(graph, 'missing');
    expect(isGeometryFinding(resolved) && resolved.code).toBe('UNKNOWN_ELEMENT');
  });

  it('reports a parent that is not in the document', () => {
    const document = documentWith([
      textElement(),
      groupElement({ id: 'ghost', childIds: ['text-1'] }),
    ]);
    const graph = buildElementGraph(document);
    // Remove the group from the id index while leaving the parent edge.
    const broken = { ...graph, byId: new Map([['text-1', document.elements[0]!]]) };
    const resolved = resolveEffectiveTransform(broken, 'text-1');
    expect(isGeometryFinding(resolved) && resolved.code).toBe('INVALID_PARENT_CHAIN');
  });

  it('cannot recurse forever on a cycle', () => {
    const document = documentWith([
      groupElement({ id: 'g1', childIds: ['g2'] }),
      groupElement({ id: 'g2', childIds: ['g1'] }),
    ]);
    const resolved = resolveEffectiveTransform(buildElementGraph(document), 'g1');
    expect(isGeometryFinding(resolved) && resolved.code).toBe('INVALID_PARENT_CHAIN');
  });

  it('keeps only the first parent when two groups claim one child', () => {
    const document = documentWith([
      textElement(),
      groupElement({ id: 'g1', transform: transform({ x: 5, y: 0 }), childIds: ['text-1'] }),
      groupElement({ id: 'g2', transform: transform({ x: 50, y: 0 }), childIds: ['text-1'] }),
    ]);
    expect(parentChain(buildElementGraph(document), 'text-1')).toEqual(['g1']);
  });
});

describe('what the engine never does to a document', () => {
  it('does not rewrite child transforms or flatten groups', () => {
    const document = documentWith([
      textElement({ transform: transform({ x: 1, y: 2 }) }),
      groupElement({ transform: transform({ x: 10, y: 10 }), childIds: ['text-1'] }),
    ]);
    const before = JSON.parse(JSON.stringify(document)) as unknown;
    resolveEffectiveTransform(buildElementGraph(document), 'text-1');
    expect(document).toEqual(before);
  });

  it('treats a group as non-drawable but its descendants as drawable', () => {
    const document = documentWith([
      textElement(),
      shapeElement({ id: 'shape-1' }),
      freehandElement({ id: 'freehand-1' }),
      groupElement({ childIds: ['text-1', 'shape-1'] }),
    ]);
    const graph = buildElementGraph(document);
    expect(drawableElements(graph).map((element) => element.id)).toEqual([
      'text-1',
      'shape-1',
      'freehand-1',
    ]);
    expect(drawableDescendants(graph, 'group-1').map((element) => element.id)).toEqual([
      'text-1',
      'shape-1',
    ]);
  });

  it('ignores z-order when resolving geometry', () => {
    const child = textElement({ transform: transform({ x: 3, y: 4 }) });
    const group = groupElement({ transform: transform({ x: 7, y: 8 }), childIds: ['text-1'] });
    const other = shapeElement({ id: 'shape-1' });
    const a = at(documentWith([other, child, group]), 'text-1')({ x: 0, y: 0 });
    const b = at(documentWith([group, child, other]), 'text-1')({ x: 0, y: 0 });
    expect(a).toEqual(b);
  });
});
