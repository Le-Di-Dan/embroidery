/**
 * @jest-environment node
 *
 * Draft → replace-body mapping, where the placement contract's meaning lives.
 *
 * Three properties are asserted here rather than through the screen, because
 * each of them is invisible in the DOM and destructive if wrong:
 *
 * - a retained row keeps its server `id`, so an edit updates rather than
 *   duplicates;
 * - a new row omits `id` entirely, so it cannot claim an existing row;
 * - an omitted row is how retirement is expressed, so what is *absent* from the
 *   body is as load-bearing as what is present.
 */
import {
  compareRows,
  toReplaceBody,
} from '../../src/features/product-placement/model/placement-body';
import {
  areaDraftOf,
  draftOf,
  emptyAreaDraft,
  emptySideDraft,
  isDirty,
} from '../../src/features/product-placement/model/placement-draft';
import { normalizePlacement } from '../../src/features/product-placement/model/placement-model';
import { placementReducer } from '../../src/features/product-placement/model/placement-reducer';
import {
  makeArea,
  makePlacement,
  makeRetiredArea,
  makeSide,
  AREA_CHEST_ID,
  SIDE_FRONT_ID,
  PLACEMENT_TOKEN,
} from '../support/placement-fixture';

const model = () => normalizePlacement(makePlacement());

describe('normalization', () => {
  it('narrows the contract-weakened nullable members to real values', () => {
    const normalized = model();
    const area = normalized.sides[0]?.areas[0];

    // The generated type says `{ [key: string]: unknown } | null`; the server
    // answers a number. Everything downstream depends on this being a number.
    expect(area?.maxWidthMm).toBe(80);
    expect(area?.retiredAt).toBeNull();
    expect(normalized.sides[0]?.areas[1]?.retiredAt).toBe('2026-07-30T08:00:00.000Z');
  });

  it('reads a missing physical maximum as null, never as zero', () => {
    const normalized = normalizePlacement(
      makePlacement({
        sides: [makeSide({ areas: [makeArea({ maxWidthMm: null })] })],
      }),
    );

    // A fabricated 0 would render as a real maximum of zero millimetres.
    expect(normalized.sides[0]?.areas[0]?.maxWidthMm).toBeNull();
  });
});

describe('replace body', () => {
  it('keeps the server id on a retained row', () => {
    const body = toReplaceBody(draftOf(model()));

    expect(body.sides[0]?.id).toBe(SIDE_FRONT_ID);
    expect(body.sides[0]?.areas[0]?.id).toBe(AREA_CHEST_ID);
  });

  it('omits the id property entirely on a new row', () => {
    const draft = placementReducer(draftOf(model()), { type: 'add-side' });
    const body = toReplaceBody({
      ...draft,
      sides: draft.sides.map((side) =>
        side.id === null
          ? { ...side, code: 'sleeve', name: 'Tay áo', backgroundAssetId: 'x', imageWidthPx: '10' }
          : side,
      ),
    });

    const created = body.sides.find((side) => side.code === 'sleeve');
    expect(created).toBeDefined();
    // Not `id: undefined` — absent. The server body is `.strict()`.
    expect(Object.hasOwn(created as object, 'id')).toBe(false);
  });

  it('never sends the local draft key', () => {
    const serialized = JSON.stringify(toReplaceBody(draftOf(model())));

    expect(serialized).not.toContain('draft-');
    expect(serialized).not.toContain('"key"');
  });

  it('echoes the token the draft was seeded from', () => {
    expect(toReplaceBody(draftOf(model())).expectedUpdatedAt).toBe(PLACEMENT_TOKEN);
  });

  it('omits a removed row, which is how retirement is requested', () => {
    const seeded = draftOf(model());
    const areaKey = seeded.sides[0]?.areas[0]?.key as string;
    const draft = placementReducer(seeded, {
      type: 'toggle-area-removed',
      sideKey: seeded.sides[0]?.key as string,
      areaKey,
    });

    const body = toReplaceBody(draft);
    expect(body.sides[0]?.areas.some((area) => area.id === AREA_CHEST_ID)).toBe(false);
  });

  it('omits an already-retired row, which the server leaves alone', () => {
    const body = toReplaceBody(draftOf(model()));

    // Resending it with its id would ask to *retain* it — the opposite of what
    // the screen shows.
    expect(body.sides[0]?.areas).toHaveLength(1);
    expect(body.sides[0]?.areas[0]?.code).toBe('chest');
  });

  it('omits an absent physical maximum instead of sending zero', () => {
    const seeded = draftOf(
      normalizePlacement(
        makePlacement({ sides: [makeSide({ areas: [makeArea({ maxWidthMm: null })] })] }),
      ),
    );

    const area = toReplaceBody(seeded).sides[0]?.areas[0];
    expect(Object.hasOwn(area as object, 'maxWidthMm')).toBe(false);
  });

  it('orders rows by displayOrder, then code, then id', () => {
    const rows = [
      { displayOrder: '1', code: 'b', id: null },
      { displayOrder: '0', code: 'z', id: null },
      { displayOrder: '1', code: 'a', id: null },
    ];

    expect([...rows].sort(compareRows).map((row) => row.code)).toEqual(['z', 'a', 'b']);
  });

  it('sends no storage key, url or parent identity', () => {
    const serialized = JSON.stringify(toReplaceBody(draftOf(model())));

    for (const forbidden of ['http', 'bucket', 'objectKey', 'storageKey', 'productSideId', 'url']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('dirty tracking', () => {
  it('is clean immediately after seeding', () => {
    const authoritative = model();
    expect(isDirty(draftOf(authoritative), authoritative)).toBe(false);
  });

  it('is dirty once a value changes', () => {
    const authoritative = model();
    const seeded = draftOf(authoritative);
    const changed = placementReducer(seeded, {
      type: 'patch-side',
      sideKey: seeded.sides[0]?.key as string,
      patch: { name: 'Mặt trước (mới)' },
    });

    expect(isDirty(changed, authoritative)).toBe(true);
  });

  it('ignores the local key, which is browser identity and not placement data', () => {
    const authoritative = model();
    const seeded = draftOf(authoritative);
    const rekeyed = { ...seeded, sides: seeded.sides.map((s) => ({ ...s, key: `${s.key}-x` })) };

    expect(isDirty(rekeyed, authoritative)).toBe(false);
  });
});

describe('reducer', () => {
  it('retires a side together with everything it contains', () => {
    const seeded = draftOf(model());
    const sideKey = seeded.sides[0]?.key as string;

    const next = placementReducer(seeded, { type: 'toggle-side-removed', sideKey });

    // An area cannot outlive its side; the server retires them together.
    expect(next.sides[0]?.removed).toBe(true);
    expect(next.sides[0]?.areas.every((area) => area.removed)).toBe(true);
  });

  it('drops a never-persisted row outright instead of marking it removed', () => {
    const withNew = placementReducer(draftOf(model()), { type: 'add-side' });
    const created = withNew.sides.find((side) => side.id === null);

    const next = placementReducer(withNew, {
      type: 'toggle-side-removed',
      sideKey: created?.key as string,
    });

    // There is nothing to retire, and a removed-but-unsaved row would linger.
    expect(next.sides.some((side) => side.id === null)).toBe(false);
  });

  it('lands a new row at the end of its parent order', () => {
    const seeded = draftOf(model());
    const next = placementReducer(seeded, {
      type: 'add-area',
      sideKey: seeded.sides[0]?.key as string,
    });

    const added = next.sides[0]?.areas.at(-1);
    expect(added?.displayOrder).toBe('2');
  });

  it('re-seeds the whole tree from an authoritative snapshot', () => {
    const seeded = placementReducer(draftOf(model()), { type: 'add-side' });
    const fresh = normalizePlacement(makePlacement({ updatedAt: '2026-08-02T00:00:00.000Z' }));

    const next = placementReducer(seeded, { type: 'seed', model: fresh });

    expect(next.expectedUpdatedAt).toBe('2026-08-02T00:00:00.000Z');
    expect(next.sides).toHaveLength(1);
  });
});

describe('draft seeding', () => {
  it('carries numbers as the text the operator will see and edit', () => {
    const authoritative = normalizePlacement(makePlacement()).sides[0]?.areas[0];
    if (authoritative === undefined) throw new Error('fixture has no area');

    expect(areaDraftOf(authoritative).boundWidthPx).toBe('400');
    // An absent maximum is an empty field, not the string "null".
    expect(areaDraftOf({ ...authoritative, maxWidthMm: null }).maxWidthMm).toBe('');
  });

  it('creates rows with no server identity', () => {
    expect(emptySideDraft().id).toBeNull();
    expect(emptyAreaDraft().id).toBeNull();
  });

  it('preserves retirement facts, which are server truth and not editable', () => {
    const retired = areaDraftOf(
      normalizePlacement(makePlacement({ sides: [makeSide({ areas: [makeRetiredArea()] })] }))
        .sides[0]?.areas[0] as never,
    );

    expect(retired.retiredAt).toBe('2026-07-30T08:00:00.000Z');
  });
});
