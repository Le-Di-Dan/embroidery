/**
 * The history model and the store that holds it (`APP3-S08`).
 *
 * The component suite proves the capabilities *ask* for entries at the right
 * boundaries; this proves the rules those questions are answered by — what
 * counts as one action, what an undo restores, what a new edit does to a redo,
 * and what happens at the bound.
 *
 * Everything here is a pure `APP3-P01` document going in and coming out. There
 * is no renderer, no DOM and no network in this file, which is the point: the
 * history is a domain concern (`ADR-APP0-001` §6), and if any of it needed a
 * browser to be testable it would not be one.
 */
import type { DesignDocument } from '@embroidery/design-document';

import { STUDIO_COPY } from '../../src/features/design-studio/model/studio-copy';
import {
  BLANK_ORIGIN,
  EMPTY_HISTORY,
  MAX_HISTORY_ENTRIES,
  baselineLabelOf,
  canRedo,
  canUndo,
  historyLabel,
  historyRowsOf,
  recordAction,
  redoTarget,
  sameDocument,
  undoTarget,
  type StudioHistoryAction,
  type StudioHistoryEntry,
} from '../../src/features/design-studio/model/studio-history';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { makeStageDocument, shapeElement, textElement } from '../support/studio-stage-fixture';

const INSIDE = { x: 150, y: 160, width: 40, height: 20, rotationDeg: 0, scaleX: 1, scaleY: 1 };
const MOVE: StudioHistoryAction = { kind: 'move', label: 'Hình khối' };
const REORDER: StudioHistoryAction = { kind: 'reorder', label: 'Hình khối' };

const base = makeStageDocument([
  shapeElement('a', { transform: INSIDE }),
  textElement('b', { text: 'Xin chào', transform: { ...INSIDE, x: 240 } }),
]);

/** The same design with one element moved. A different document, same shape. */
function movedBy(document: DesignDocument, dx: number): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      element.id === 'a'
        ? { ...element, transform: { ...element.transform, x: element.transform.x + dx } }
        : element,
    ),
  };
}

function entry(seq: number, before: DesignDocument, after: DesignDocument): StudioHistoryEntry {
  return { seq, action: MOVE, before, after };
}

const store = () => useStudioDocumentStore.getState();
const history = () => store().history;
const documentX = () =>
  store().document?.elements.find((element) => element.id === 'a')?.transform.x;

beforeEach(() => {
  store().reset();
});

describe('what one entry is (APP3-S08 §7, §8)', () => {
  it('starts with an empty past and an empty future', () => {
    expect(EMPTY_HISTORY.entries).toHaveLength(0);
    expect(EMPTY_HISTORY.cursor).toBe(0);
    expect(canUndo(EMPTY_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_HISTORY)).toBe(false);
  });

  it('appends one entry per recorded action', () => {
    const one = recordAction(EMPTY_HISTORY, entry(1, base, movedBy(base, 10)));
    expect(one.entries).toHaveLength(1);
    expect(one.cursor).toBe(1);
    expect(canUndo(one)).toBe(true);
    expect(canRedo(one)).toBe(false);
  });

  it('answers undo and redo with the two ends of the entry', () => {
    const after = movedBy(base, 10);
    const one = recordAction(EMPTY_HISTORY, entry(1, base, after));
    expect(undoTarget(one)?.before).toBe(base);
    expect(redoTarget(one)).toBeNull();

    const stepped = { entries: one.entries, cursor: 0 };
    expect(redoTarget(stepped)?.after).toBe(after);
  });

  it('discards the future when a new action is recorded', () => {
    const first = recordAction(EMPTY_HISTORY, entry(1, base, movedBy(base, 10)));
    const undone = { entries: first.entries, cursor: 0 };
    expect(canRedo(undone)).toBe(true);

    const branched = recordAction(undone, entry(2, base, movedBy(base, -10)));
    expect(branched.entries).toHaveLength(1);
    expect(canRedo(branched)).toBe(false);
  });
});

describe('the bound (APP3-S08 §6)', () => {
  it('never grows past the limit', () => {
    let state = EMPTY_HISTORY;
    for (let n = 0; n < MAX_HISTORY_ENTRIES + 12; n += 1) {
      state = recordAction(state, entry(n + 1, base, movedBy(base, n)));
    }
    expect(state.entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(state.cursor).toBe(MAX_HISTORY_ENTRIES);
  });

  it('evicts the oldest entry, keeping the most recent work reachable', () => {
    let state = EMPTY_HISTORY;
    for (let n = 0; n < MAX_HISTORY_ENTRIES + 1; n += 1) {
      state = recordAction(state, entry(n + 1, base, movedBy(base, n)));
    }
    // Sequence 1 is gone and the newest is still on the end.
    expect(state.entries.map((item) => item.seq)).not.toContain(1);
    expect(state.entries.at(-1)?.seq).toBe(MAX_HISTORY_ENTRIES + 1);
  });
});

describe('what a row says (APP3-S08 §14, §17; APP3-S08-C1 §4)', () => {
  const BASELINE = 'Mở từ mẫu “Hoa sen cổ điển”';

  function twoActions() {
    const first = recordAction(EMPTY_HISTORY, entry(1, base, movedBy(base, 10)));
    return recordAction(first, {
      seq: 2,
      action: REORDER,
      before: movedBy(base, 10),
      after: movedBy(base, 20),
    });
  }

  it('reads oldest first, from the baseline, exactly as 609:147 draws it', () => {
    const rows = historyRowsOf(twoActions(), BASELINE);

    expect(rows.map((row) => row.label)).toEqual([
      BASELINE,
      expect.stringContaining('Di chuyển'),
      expect.stringContaining('thứ tự'),
    ]);
    expect(rows[0]?.baseline).toBe(true);
    expect(rows.slice(1).every((row) => !row.baseline)).toBe(true);
  });

  it('marks the baseline current when nothing has been done yet', () => {
    const rows = historyRowsOf(EMPTY_HISTORY, BASELINE);

    // The engine is genuinely empty; the row is projection.
    expect(EMPTY_HISTORY.entries).toHaveLength(0);
    expect(EMPTY_HISTORY.cursor).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ baseline: true, current: true });
  });

  it('marks the action at cursor - 1, and exactly one row anywhere', () => {
    const state = twoActions();

    for (const cursor of [0, 1, 2]) {
      const rows = historyRowsOf({ entries: state.entries, cursor }, BASELINE);
      expect(rows.filter((row) => row.current)).toHaveLength(1);
      expect(rows.findIndex((row) => row.current)).toBe(cursor);
    }
  });

  it('keeps the rows a redo would return to visible after an undo', () => {
    const state = twoActions();

    const rows = historyRowsOf({ entries: state.entries, cursor: 1 }, BASELINE);

    // Three rows still, with the marker in the middle: one past, one current,
    // one future. Hiding the future would leave redo pointing at nothing.
    expect(rows).toHaveLength(3);
    expect(rows[1]?.current).toBe(true);
    expect(rows[2]?.current).toBe(false);
  });

  it('names no identifier, and falls back rather than inventing one', () => {
    for (const kind of ['move', 'resize', 'rotate', 'reorder', 'text-edit'] as const) {
      expect(historyLabel({ kind, label: null })).not.toMatch(/[0-9a-f]{8}-/);
      expect(historyLabel({ kind, label: null })).toBe('Thay đổi thiết kế');
    }
    // A placement names no layer, because nothing was replaced.
    expect(historyLabel({ kind: 'image-place', label: null })).toBe('Thêm hình ảnh');
  });

  it('keys rows by a sequence eviction cannot reuse', () => {
    let state = EMPTY_HISTORY;
    for (let n = 0; n < MAX_HISTORY_ENTRIES + 3; n += 1) {
      state = recordAction(state, entry(n + 1, base, movedBy(base, n)));
    }
    const keys = historyRowsOf(state, 'Bắt đầu').map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('what the baseline row is allowed to say (APP3-S08-C1 §5)', () => {
  const SLUG = 'hoa-sen-co-dien';

  it('quotes the Template display name on a clone that has one', () => {
    expect(baselineLabelOf({ cloned: true, templateName: 'Hoa sen cổ điển' })).toBe(
      'Mở từ mẫu “Hoa sen cổ điển”',
    );
  });

  it('uses the accepted blank-start label on a blank Session', () => {
    expect(baselineLabelOf(BLANK_ORIGIN)).toBe(STUDIO_COPY.startBlank);
    expect(baselineLabelOf({ cloned: false, templateName: 'ignored' })).toBe(
      STUDIO_COPY.startBlank,
    );
  });

  it('never renders a slug, a version or an id as though it were a name', () => {
    // The resume case: `APP3-B07` lineage carries a slug and a version and no
    // display name at all.
    for (const templateName of [null, '', '   ']) {
      const label = baselineLabelOf({ cloned: true, templateName });
      expect(label).toBe('Mở từ mẫu có sẵn');
      expect(label).not.toContain(SLUG);
      expect(label).not.toMatch(/[0-9a-f]{8}-/);
      expect(label).not.toMatch(/\d/);
    }
  });

  it('bounds a hostile name to the same length a layer name is bounded to', () => {
    const label = baselineLabelOf({ cloned: true, templateName: 'A'.repeat(400) });

    expect([...label].length).toBeLessThan(60);
    expect(label).toContain('…');
  });
});

describe('whether the design actually changed (APP3-S08 §7)', () => {
  it('is true for the same reference without canonicalizing', () => {
    expect(sameDocument(base, base)).toBe(true);
  });

  it('is true for an equal document built separately', () => {
    // Not a clone helper: a value-equal document reached through the same
    // immutable rebuild every mutation uses, which is what a drag out and back
    // to its starting point actually produces.
    const rebuilt: DesignDocument = {
      ...base,
      elements: base.elements.map((item) => ({ ...item })),
    };
    expect(rebuilt).not.toBe(base);
    expect(sameDocument(base, rebuilt)).toBe(true);
  });

  it('is false once a value differs', () => {
    expect(sameDocument(base, movedBy(base, 1))).toBe(false);
  });
});

describe('the store keeps one current document beside its history (APP3-S08 §5)', () => {
  beforeEach(() => {
    store().initialize('session-1|1', base);
  });

  it('records one entry per atomic commit', () => {
    store().commit(movedBy(base, 10), MOVE);
    expect(history().entries).toHaveLength(1);
    expect(documentX()).toBe(INSIDE.x + 10);
  });

  it('restores the exact prior document on undo and the exact next on redo', () => {
    const after = movedBy(base, 10);
    store().commit(after, MOVE);

    store().undo();
    expect(store().document).toBe(base);
    expect(history().cursor).toBe(0);

    store().redo();
    expect(store().document).toBe(after);
    expect(history().cursor).toBe(1);
  });

  it('never records the undo or the redo as actions of their own', () => {
    store().commit(movedBy(base, 10), MOVE);
    store().undo();
    store().redo();
    store().undo();
    expect(history().entries).toHaveLength(1);
  });

  it('does nothing at either end rather than throwing', () => {
    store().undo();
    expect(store().document).toBe(base);
    store().redo();
    expect(store().document).toBe(base);
  });

  it('clears the future when a new edit follows an undo', () => {
    store().commit(movedBy(base, 10), MOVE);
    store().undo();
    expect(canRedo(history())).toBe(true);

    store().commit(movedBy(base, -10), MOVE);
    expect(canRedo(history())).toBe(false);
    expect(history().entries).toHaveLength(1);
  });
});

describe('a coalesced action is one entry (APP3-S08 §10, §11)', () => {
  beforeEach(() => {
    store().initialize('session-1|1', base);
  });

  it('appends nothing while the action is open, and one entry when it closes', () => {
    store().beginAction(MOVE);
    for (let frame = 1; frame <= 20; frame += 1) store().commit(movedBy(base, frame), MOVE);
    expect(history().entries).toHaveLength(0);

    store().endAction();
    expect(history().entries).toHaveLength(1);
    expect(undoTarget(history())?.before).toBe(base);
    expect(documentX()).toBe(INSIDE.x + 20);
  });

  it('appends nothing at all when the action ended where it started', () => {
    store().beginAction(MOVE);
    store().commit(movedBy(base, 10), MOVE);
    store().commit(movedBy(base, 0), MOVE);
    store().endAction();
    expect(history().entries).toHaveLength(0);
  });

  it('appends nothing when the action never committed a frame', () => {
    store().beginAction(MOVE);
    store().endAction();
    expect(history().entries).toHaveLength(0);
  });

  it('undoes the whole gesture rather than its last frame', () => {
    store().beginAction(MOVE);
    for (let frame = 1; frame <= 5; frame += 1) store().commit(movedBy(base, frame), MOVE);
    store().endAction();

    store().undo();
    expect(documentX()).toBe(INSIDE.x);
  });

  it('closes an open action rather than folding an unrelated one into it', () => {
    store().beginAction(MOVE);
    store().commit(movedBy(base, 10), MOVE);
    // A different capability commits while the gesture is still open.
    store().commit(movedBy(base, 30), REORDER);

    expect(history().entries).toHaveLength(2);
    expect(history().entries.map((item) => item.action.kind)).toEqual(['move', 'reorder']);
  });

  it('closes an open action when another one begins', () => {
    store().beginAction(MOVE);
    store().commit(movedBy(base, 10), MOVE);
    store().beginAction(REORDER);
    expect(history().entries).toHaveLength(1);
  });
});

describe('a Session boundary (APP3-S08 §16)', () => {
  it('clears the past and the future, and makes the new snapshot the baseline', () => {
    store().initialize('session-1|1', base);
    store().commit(movedBy(base, 10), MOVE);
    expect(history().entries).toHaveLength(1);

    const other = makeStageDocument([shapeElement('z', { transform: INSIDE })]);
    store().initialize('session-2|1', other);

    expect(history()).toBe(EMPTY_HISTORY);
    expect(canUndo(history())).toBe(false);
    expect(store().document).toBe(other);
  });

  it('leaves an edited document alone when the same Session re-initializes', () => {
    store().initialize('session-1|1', base);
    store().commit(movedBy(base, 10), MOVE);
    store().initialize('session-1|1', base);

    expect(documentX()).toBe(INSIDE.x + 10);
    expect(history().entries).toHaveLength(1);
  });

  it('starts a reset runtime with nothing to undo', () => {
    store().initialize('session-1|1', base);
    store().commit(movedBy(base, 10), MOVE);
    store().reset();

    expect(history()).toBe(EMPTY_HISTORY);
    expect(store().document).toBeNull();
  });
});

describe('an entry carries documents and nothing else (APP3-S08 §2)', () => {
  it('holds only what APP3-P01 can express', () => {
    store().initialize('session-1|1', base);
    store().commit(movedBy(base, 10), MOVE);

    const recorded = history().entries[0];
    expect(recorded).toBeDefined();
    // Serializable end to end: a DOM node, a Blob, an object URL or an engine
    // graph in here would throw rather than round-trip.
    expect(() => JSON.stringify(recorded)).not.toThrow();
    expect(Object.keys(recorded ?? {}).sort()).toEqual(['action', 'after', 'before', 'seq']);
    expect(Object.keys(recorded?.action ?? {}).sort()).toEqual(['kind', 'label']);
  });
});
