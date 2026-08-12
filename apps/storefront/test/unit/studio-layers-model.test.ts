/**
 * The layer capability's pure rules (`APP3-S04`).
 *
 * Everything here is decidable without a DOM, a network or a clock: the
 * projection, the three document mutations and the exact set of fields each of
 * them is allowed to touch. The component test proves the panel asks these
 * questions; this proves the answers.
 */
import { buildElementGraph } from '@embroidery/design-engine';
import type { DesignDocument } from '@embroidery/design-document';

import {
  layerLabel,
  layerRowsOf,
  moveUnavailableReason,
  withElementLocked,
  withElementMovedTo,
  withElementStepped,
  withElementVisible,
} from '../../src/features/design-studio/model/studio-layers';
import { STUDIO_LAYER_COPY } from '../../src/features/design-studio/model/studio-layer-copy';
import {
  freehandElement,
  groupElement,
  imageElement,
  makeStageDocument,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

/** Bottom first, as `APP3-P01` defines the array. */
const document = makeStageDocument([
  textElement('bottom', { text: 'Dưới cùng' }),
  shapeElement('middle'),
  imageElement('top'),
]);

const graphOf = (candidate: DesignDocument) => buildElementGraph(candidate);
const idsOf = (candidate: DesignDocument | null) =>
  candidate === null ? null : candidate.elements.map((element) => element.id);
const rows = (candidate: DesignDocument = document, selected: string | null = null) =>
  layerRowsOf(candidate, selected, graphOf(candidate));

describe('layerRowsOf', () => {
  it('projects the working document, front-most first', () => {
    // The array is bottom-first; the list reads the other way round.
    expect(rows().map((row) => row.id)).toEqual(['top', 'middle', 'bottom']);
  });

  it('keys every row by the stable element id', () => {
    for (const row of rows()) {
      expect(document.elements.some((element) => element.id === row.id)).toBe(true);
    }
  });

  it('carries the P01 flags rather than a copy of them', () => {
    const candidate = makeStageDocument([
      textElement('a', { locked: true }),
      shapeElement('b', { visible: false }),
    ]);

    expect(
      rows(candidate).map((row) => ({ id: row.id, visible: row.visible, locked: row.locked })),
    ).toEqual([
      { id: 'b', visible: false, locked: false },
      { id: 'a', visible: true, locked: true },
    ]);
  });

  it('marks the selected row and no other', () => {
    expect(
      rows(document, 'middle')
        .filter((row) => row.selected)
        .map((row) => row.id),
    ).toEqual(['middle']);
  });

  it('is empty for a document that has no elements', () => {
    expect(rows(makeStageDocument([]))).toEqual([]);
  });

  it('offers no move past either end of the list', () => {
    const list = rows();
    expect(list[0]?.moves).toEqual({ up: false, down: true });
    expect(list[2]?.moves).toEqual({ up: true, down: false });
    expect(list[1]?.moves).toEqual({ up: true, down: true });
  });

  it('offers no move for an element inside a group, and says why', () => {
    const candidate = makeStageDocument([
      textElement('child'),
      groupElement('g', ['child']),
      shapeElement('other'),
    ]);
    const child = rows(candidate).find((row) => row.id === 'child');

    expect(child?.nested).toBe(true);
    expect(child?.moves).toEqual({ up: false, down: false });
    expect(moveUnavailableReason(child!, 'up')).toBe(STUDIO_LAYER_COPY.nestedReason);
  });

  it('represents a group as a layer of its own', () => {
    const candidate = makeStageDocument([textElement('child'), groupElement('g', ['child'])]);
    const group = rows(candidate).find((row) => row.id === 'g');

    expect(group?.typeLabel).toBe(STUDIO_LAYER_COPY.typeGroup);
    expect(group?.nested).toBe(false);
  });
});

describe('layerLabel', () => {
  it('names a text element with its own text', () => {
    expect(layerLabel(textElement('t', { text: 'Thêu tên' }))).toBe('Thêu tên');
  });

  it('falls back to the kind when the text is blank', () => {
    expect(layerLabel(textElement('t', { text: '   ' }))).toBe(STUDIO_LAYER_COPY.typeText);
  });

  it('bounds a long label without splitting a character', () => {
    const label = layerLabel(textElement('t', { text: 'Nệ'.repeat(80) }));

    expect([...label]).toHaveLength(33);
    expect(label.endsWith('…')).toBe(true);
    expect(label).not.toContain('�');
  });

  it('names every other kind by what it is', () => {
    expect(layerLabel(imageElement('i'))).toBe(STUDIO_LAYER_COPY.typeImage);
    expect(layerLabel(shapeElement('s'))).toBe(STUDIO_LAYER_COPY.typeShape);
    expect(layerLabel(freehandElement('f'))).toBe(STUDIO_LAYER_COPY.typeFreehand);
    expect(layerLabel(groupElement('g', []))).toBe(STUDIO_LAYER_COPY.typeGroup);
  });

  it('never uses an internal identifier as a label', () => {
    for (const element of [imageElement('el-1'), shapeElement('el-2'), groupElement('el-3', [])]) {
      const label = layerLabel(element);
      expect(label).not.toContain(element.id);
      expect(label).not.toContain('asset');
      expect(label).not.toContain('derivative');
    }
  });
});

describe('withElementStepped', () => {
  it('moves one place toward the front', () => {
    expect(idsOf(withElementStepped(document, 'bottom', 'up', graphOf(document)))).toEqual([
      'middle',
      'bottom',
      'top',
    ]);
  });

  it('moves one place toward the back', () => {
    expect(idsOf(withElementStepped(document, 'top', 'down', graphOf(document)))).toEqual([
      'bottom',
      'top',
      'middle',
    ]);
  });

  it('refuses at each boundary, agreeing with the disabled control', () => {
    expect(withElementStepped(document, 'top', 'up', graphOf(document))).toBeNull();
    expect(withElementStepped(document, 'bottom', 'down', graphOf(document))).toBeNull();
  });

  it('refuses to restack an element inside a group', () => {
    const candidate = makeStageDocument([
      textElement('child'),
      groupElement('g', ['child']),
      shapeElement('other'),
    ]);

    expect(withElementStepped(candidate, 'child', 'up', graphOf(candidate))).toBeNull();
  });

  it('steps over a whole group rather than into it', () => {
    // `other` is above the group in the array. Stepping it down must land it
    // below the group, never between the group and its child.
    const candidate = makeStageDocument([
      textElement('child'),
      groupElement('g', ['child']),
      shapeElement('other'),
    ]);

    expect(idsOf(withElementStepped(candidate, 'other', 'down', graphOf(candidate)))).toEqual([
      'child',
      'other',
      'g',
    ]);
  });
});

describe('withElementMovedTo', () => {
  it('moves the dragged element to the target position', () => {
    expect(idsOf(withElementMovedTo(document, 'bottom', 'top', graphOf(document)))).toEqual([
      'middle',
      'top',
      'bottom',
    ]);
  });

  it('changes the array order and nothing else at all', () => {
    const moved = withElementMovedTo(document, 'bottom', 'top', graphOf(document));

    expect(moved?.placement).toEqual(document.placement);
    expect(moved?.schemaVersion).toBe(document.schemaVersion);
    for (const before of document.elements) {
      const after = moved?.elements.find((element) => element.id === before.id);
      // The same object, not a rebuilt equal one: identity is what keeps the
      // `APP3-S03-C1` render reuse alive across a restack.
      expect(after).toBe(before);
    }
  });

  it('refuses a drop on itself, on an unknown id, or involving a nested row', () => {
    const graph = graphOf(document);
    expect(withElementMovedTo(document, 'top', 'top', graph)).toBeNull();
    expect(withElementMovedTo(document, 'top', 'gone', graph)).toBeNull();

    const nested = makeStageDocument([
      textElement('child'),
      groupElement('g', ['child']),
      shapeElement('other'),
    ]);
    expect(withElementMovedTo(nested, 'other', 'child', graphOf(nested))).toBeNull();
    expect(withElementMovedTo(nested, 'child', 'other', graphOf(nested))).toBeNull();
  });

  it('never changes parentage', () => {
    const nested = makeStageDocument([
      textElement('child'),
      groupElement('g', ['child']),
      shapeElement('other'),
    ]);
    const moved = withElementMovedTo(nested, 'other', 'g', graphOf(nested));
    const group = moved?.elements.find((element) => element.id === 'g');

    expect(group?.type === 'group' ? group.childIds : null).toEqual(['child']);
    expect(graphOf(moved!).parentOf.get('other')).toBeUndefined();
  });
});

describe('withElementVisible', () => {
  it('flips exactly the one flag', () => {
    const hidden = withElementVisible(document, 'middle', false);
    const element = hidden?.elements.find((candidate) => candidate.id === 'middle');
    const before = document.elements.find((candidate) => candidate.id === 'middle');

    expect(element?.visible).toBe(false);
    expect({ ...element, visible: true }).toEqual(before);
  });

  it('deletes nothing, moves nothing and touches no media', () => {
    const candidate = makeStageDocument([imageElement('i'), textElement('t')]);
    const hidden = withElementVisible(candidate, 'i', false);

    expect(idsOf(hidden)).toEqual(['i', 't']);
    const image = hidden?.elements.find((element) => element.id === 'i');
    expect(image).toMatchObject({ type: 'image', assetId: 'asset-i', opacity: 1 });
  });

  it('never substitutes an opacity for a hidden flag', () => {
    const hidden = withElementVisible(document, 'middle', false);

    expect(hidden?.elements.find((element) => element.id === 'middle')?.opacity).toBe(1);
  });

  it('reports nothing to do when the flag already has that value', () => {
    expect(withElementVisible(document, 'middle', true)).toBeNull();
    expect(withElementVisible(document, 'gone', false)).toBeNull();
  });
});

describe('withElementLocked', () => {
  it('flips exactly the one flag', () => {
    const locked = withElementLocked(document, 'top', true);
    const element = locked?.elements.find((candidate) => candidate.id === 'top');
    const before = document.elements.find((candidate) => candidate.id === 'top');

    expect(element?.locked).toBe(true);
    expect({ ...element, locked: false }).toEqual(before);
  });

  it('changes no geometry, no z-order and no visibility', () => {
    const locked = withElementLocked(document, 'top', true);

    expect(idsOf(locked)).toEqual(['bottom', 'middle', 'top']);
    const element = locked?.elements.find((candidate) => candidate.id === 'top');
    const before = document.elements.find((candidate) => candidate.id === 'top');
    expect(element?.transform).toEqual(before?.transform);
    expect(element?.visible).toBe(true);
  });

  it('does not rewrite a locked group into its children', () => {
    const candidate = makeStageDocument([textElement('child'), groupElement('g', ['child'])]);
    const locked = withElementLocked(candidate, 'g', true);

    expect(locked?.elements.find((element) => element.id === 'g')?.locked).toBe(true);
    expect(locked?.elements.find((element) => element.id === 'child')?.locked).toBe(false);
  });

  it('reports nothing to do when the flag already has that value', () => {
    expect(withElementLocked(document, 'top', false)).toBeNull();
  });
});
