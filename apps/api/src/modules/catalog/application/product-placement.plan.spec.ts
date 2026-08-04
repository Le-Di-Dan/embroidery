/**
 * Planning a placement replace (`APP3-B01`).
 *
 * These are the decisions, so they are tested without a database. The cases
 * worth reading twice are the ones that would otherwise be silently wrong
 * rather than loudly broken:
 *
 * - an omitted row is **retired**, never deleted — deleting is what the store
 *   would do if nobody had ruled, and it would take an approved design's
 *   placement with it;
 * - a row addressed from the wrong parent is refused even though every foreign
 *   key would still be satisfied afterwards;
 * - a numeric that round-trips to the same value is *not* a change, because
 *   treating `5.0` and `5` as different would make an untouched referenced side
 *   fail the database's protection guard on every save.
 */
import type {
  PlacementAreaRow,
  PlacementSideRow,
} from '../domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../domain/repositories/placement-hierarchy.port';
import { planPlacementReplace, type AreaCommand, type SideCommand } from './product-placement.plan';

const PRODUCT = 'product-1' as ProductId;
const SIDE = 'side-1' as ProductSideId;
const AREA = 'area-1' as EmbroideryAreaId;

let counter = 0;
const nextId = () => `generated-${(counter += 1)}`;
beforeEach(() => {
  counter = 0;
});

const sideCommand = (overrides: Partial<SideCommand> = {}): SideCommand => ({
  code: 'front',
  name: 'Mặt trước',
  displayOrder: 0,
  backgroundAssetId: 'asset-1',
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  physicalWidthMm: 200,
  physicalHeightMm: 200,
  pxPerMm: 5,
  areas: [],
  ...overrides,
});

const areaCommand = (overrides: Partial<AreaCommand> = {}): AreaCommand => ({
  code: 'chest',
  name: 'Ngực',
  displayOrder: 0,
  boundXPx: 100,
  boundYPx: 100,
  boundWidthPx: 400,
  boundHeightPx: 300,
  ...overrides,
});

const storedSide = (overrides: Partial<PlacementSideRow> = {}): PlacementSideRow => ({
  id: SIDE,
  productId: PRODUCT,
  code: 'front',
  name: 'Mặt trước',
  displayOrder: 0,
  backgroundAssetId: 'asset-1',
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  physicalWidthMm: '200',
  physicalHeightMm: '200',
  pxPerMm: '5',
  retiredAt: undefined,
  supersededById: undefined,
  ...overrides,
});

const storedArea = (overrides: Partial<PlacementAreaRow> = {}): PlacementAreaRow => ({
  id: AREA,
  productSideId: SIDE,
  code: 'chest',
  name: 'Ngực',
  displayOrder: 0,
  boundXPx: '100',
  boundYPx: '100',
  boundWidthPx: '400',
  boundHeightPx: '300',
  maxWidthMm: undefined,
  maxHeightMm: undefined,
  retiredAt: undefined,
  supersededById: undefined,
  ...overrides,
});

const plan = (
  commands: readonly SideCommand[],
  currentSides: readonly PlacementSideRow[] = [],
  currentAreas: readonly PlacementAreaRow[] = [],
) => planPlacementReplace({ productId: PRODUCT, commands, currentSides, currentAreas, nextId });

const codeOf = (work: () => unknown): string => {
  try {
    work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

describe('creating placement', () => {
  it('creates a side and its areas on an empty product', () => {
    const result = plan([sideCommand({ areas: [areaCommand()] })]);
    expect(result.sides.created).toHaveLength(1);
    expect(result.sides.created[0]?.productId).toBe(PRODUCT);
    expect(result.areas.created).toHaveLength(1);
    expect(result.areas.created[0]?.productSideId).toBe(result.sides.created[0]?.id);
    expect(result.sides.retired).toEqual([]);
  });

  it('writes measurements back as decimal strings, not floats', () => {
    // 1000px over 400mm is 2.5 px/mm on both axes, so the engine accepts it.
    const result = plan([
      sideCommand({
        physicalWidthMm: 400,
        physicalHeightMm: 400,
        pxPerMm: 2.5,
        areas: [areaCommand()],
      }),
    ]);
    expect(result.sides.created[0]?.pxPerMm).toBe('2.5');
    expect(result.areas.created[0]?.boundWidthPx).toBe('400');
  });

  it('accepts an empty placement, which is a product with no Studio', () => {
    const result = plan([]);
    expect(result.sides.created).toEqual([]);
    expect(result.sides.retired).toEqual([]);
  });
});

describe('retaining and updating', () => {
  it('keeps a retained id and plans no change when nothing differs', () => {
    const result = plan([sideCommand({ id: SIDE })], [storedSide()]);
    expect(result.sides.created).toEqual([]);
    expect(result.sides.updated).toEqual([]);
    expect(result.sides.retired).toEqual([]);
  });

  it('plans only the columns that actually differ', () => {
    const result = plan(
      [sideCommand({ id: SIDE, name: 'Trước', displayOrder: 3 })],
      [storedSide()],
    );
    expect(result.sides.updated).toEqual([
      { id: SIDE, fields: { name: 'Trước', displayOrder: 3 } },
    ]);
  });

  it('treats a numerically equal measurement as unchanged', () => {
    // `5.0` and `5` are the same scale. Planning an update would send the
    // protection guard a geometry change that never happened.
    const result = plan([sideCommand({ id: SIDE, pxPerMm: 5 })], [storedSide({ pxPerMm: '5.00' })]);
    expect(result.sides.updated).toEqual([]);
  });

  it('plans a geometry change for an unreferenced side', () => {
    const result = plan(
      [sideCommand({ id: SIDE, imageWidthPx: 1200, physicalWidthMm: 240 })],
      [storedSide()],
    );
    expect(result.sides.updated[0]?.fields).toEqual({
      imageWidthPx: 1200,
      physicalWidthMm: '240',
    });
  });

  it('clears an optional maximum that the request dropped', () => {
    const result = plan(
      [sideCommand({ id: SIDE, areas: [areaCommand({ id: AREA })] })],
      [storedSide()],
      [storedArea({ maxWidthMm: '80' })],
    );
    expect(result.areas.updated[0]?.fields).toEqual({ maxWidthMm: null });
  });
});

describe('removal is retirement', () => {
  it('retires an omitted side and its areas rather than deleting them', () => {
    const result = plan([], [storedSide()], [storedArea()]);
    expect(result.sides.retired).toEqual([{ id: SIDE }]);
    expect(result.areas.retired).toEqual([{ id: AREA }]);
    expect(JSON.stringify(result)).not.toContain('delete');
  });

  it('retires an omitted area while its side is retained', () => {
    const result = plan([sideCommand({ id: SIDE, areas: [] })], [storedSide()], [storedArea()]);
    expect(result.sides.retired).toEqual([]);
    expect(result.areas.retired).toEqual([{ id: AREA }]);
  });

  it('leaves an already-retired row alone', () => {
    // Re-retiring would move `retired_at` and rewrite history for no reason.
    const result = plan([], [storedSide({ retiredAt: new Date('2026-01-01T00:00:00Z') })]);
    expect(result.sides.retired).toEqual([]);
  });
});

describe('supersession', () => {
  it('retires the replaced row with a pointer to its replacement', () => {
    const result = plan([sideCommand({ code: 'front-v2', supersedesId: SIDE })], [storedSide()]);
    const replacement = result.sides.created[0];
    expect(replacement?.code).toBe('front-v2');
    expect(result.sides.retired).toEqual([{ id: SIDE, supersededById: replacement?.id }]);
  });

  it('refuses a replacement target that is also retained', () => {
    // A row cannot be both kept and replaced: two live rows would claim one
    // identity and no reader could tell which the Template meant.
    expect(
      codeOf(() =>
        plan(
          [sideCommand({ id: SIDE }), sideCommand({ code: 'front-v2', supersedesId: SIDE })],
          [storedSide()],
        ),
      ),
    ).toBe('PLACEMENT_REPLACEMENT_INVALID');
  });

  it('refuses a replacement target from another product', () => {
    expect(
      codeOf(() => plan([sideCommand({ code: 'front-v2', supersedesId: 'side-elsewhere' })], [])),
    ).toBe('PLACEMENT_REPLACEMENT_INVALID');
  });

  it('refuses an area replacing one from another side', () => {
    const other = storedArea({
      id: 'area-other' as EmbroideryAreaId,
      productSideId: 'side-2' as ProductSideId,
    });
    expect(
      codeOf(() =>
        plan(
          [
            sideCommand({
              id: SIDE,
              areas: [areaCommand({ code: 'chest-v2', supersedesId: other.id })],
            }),
          ],
          [storedSide()],
          [storedArea(), other],
        ),
      ),
    ).toBe('PLACEMENT_REPLACEMENT_INVALID');
  });
});

describe('what a request may not do', () => {
  it('refuses two sides sharing a code', () => {
    expect(codeOf(() => plan([sideCommand(), sideCommand({ code: 'front' })]))).toBe(
      'PLACEMENT_CODE_DUPLICATE',
    );
  });

  it('refuses two areas of one side sharing a code', () => {
    expect(codeOf(() => plan([sideCommand({ areas: [areaCommand(), areaCommand()] })]))).toBe(
      'PLACEMENT_CODE_DUPLICATE',
    );
  });

  it('allows the same code on two different sides', () => {
    const result = plan([
      sideCommand({ code: 'front', areas: [areaCommand()] }),
      sideCommand({ code: 'back', areas: [areaCommand()] }),
    ]);
    expect(result.areas.created).toHaveLength(2);
  });

  it('refuses a malformed code before the database sees it', () => {
    expect(codeOf(() => plan([sideCommand({ code: 'Mặt Trước' })]))).toBe('PLACEMENT_INVALID');
  });

  it('refuses a side id that belongs to another product', () => {
    expect(codeOf(() => plan([sideCommand({ id: 'side-elsewhere' })], [storedSide()]))).toBe(
      'PLACEMENT_ROW_NOT_IN_PARENT',
    );
  });

  it('refuses an area id that belongs to another side', () => {
    const other = storedArea({
      id: 'area-other' as EmbroideryAreaId,
      productSideId: 'side-2' as ProductSideId,
    });
    expect(
      codeOf(() =>
        plan(
          [sideCommand({ id: SIDE, areas: [areaCommand({ id: other.id })] })],
          [storedSide()],
          [other],
        ),
      ),
    ).toBe('PLACEMENT_ROW_NOT_IN_PARENT');
  });

  it('refuses the same id twice in one request', () => {
    expect(
      codeOf(() =>
        plan([sideCommand({ id: SIDE }), sideCommand({ id: SIDE, code: 'back' })], [storedSide()]),
      ),
    ).toBe('PLACEMENT_ROW_NOT_IN_PARENT');
  });
});

describe('geometry, through the engine', () => {
  it('refuses a side whose two axes imply different scales', () => {
    // 1200px / 200mm is 6 px/mm on x and 5 on y; averaging would hide both.
    expect(codeOf(() => plan([sideCommand({ imageWidthPx: 1200 })]))).toBe(
      'PLACEMENT_SCALE_INCONSISTENT',
    );
  });

  it('refuses an area that leaves the canvas', () => {
    expect(codeOf(() => plan([sideCommand({ areas: [areaCommand({ boundXPx: 900 })] })]))).toBe(
      'PLACEMENT_AREA_OUTSIDE_CANVAS',
    );
  });

  it('accepts an area flush with the canvas edge', () => {
    // Boundary-inclusive: rejecting this would make the last usable column of
    // pixels unreachable.
    const result = plan([
      sideCommand({ areas: [areaCommand({ boundXPx: 600, boundWidthPx: 400 })] }),
    ]);
    expect(result.areas.created).toHaveLength(1);
  });

  it('validates every side before planning a single write', () => {
    const result = codeOf(() =>
      plan([sideCommand({ code: 'front' }), sideCommand({ code: 'back', pxPerMm: 4 })]),
    );
    expect(result).toBe('PLACEMENT_SCALE_INCONSISTENT');
  });
});
