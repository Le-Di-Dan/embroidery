/**
 * The Studio bootstrap's pure model (`APP3-S01`).
 *
 * Deterministic selection, the cascade a placement change forces, keyset
 * continuation, and the one place a preview asset id may come from. These are
 * the rules that must hold before any component renders, so they are proved
 * without one.
 */
import {
  codesOf,
  findArea,
  findSide,
  initialAreaOf,
  initialSideOf,
  orderedSides,
  tripleOf,
} from '../../src/features/design-studio/model/studio-placement';
import {
  EMPTY_STUDIO_SELECTION,
  studioSelectionReducer,
} from '../../src/features/design-studio/model/studio-selection';
import {
  flattenTemplatePages,
  nextCursorOf,
  previewReferenceOf,
} from '../../src/features/design-studio/model/studio-template';
import {
  makeArea,
  makeDocument,
  makePlacement,
  makeSide,
  makeTemplate,
  makeTemplateDetail,
  makeTemplatePage,
  PRODUCT_ID,
} from '../support/studio-fixture';

describe('deterministic Side and Area selection (IMP-D041)', () => {
  it('orders by displayOrder, then code, then id', () => {
    const placement = makePlacement({
      sides: [
        makeSide({ id: 'c', code: 'b', displayOrder: 2 }),
        makeSide({ id: 'b', code: 'a', displayOrder: 1 }),
        makeSide({ id: 'a', code: 'a', displayOrder: 1 }),
      ],
    });

    // Same displayOrder and same code: the immutable id breaks the tie, so
    // "the first row" is the same row on every load.
    expect(orderedSides(placement).map((side) => side.id)).toEqual(['a', 'b', 'c']);
  });

  it('auto-selects the only Side and the only Area', () => {
    const placement = makePlacement();
    const side = initialSideOf(placement);

    expect(side?.id).toBe('side-1');
    expect(initialAreaOf(side)?.id).toBe('area-1');
  });

  it('starts on the canonical first Side even when it carries no Area', () => {
    // PO-04 names the ordered active Side list as the authority. `studioEligible`
    // being true through a later Side does not license skipping the first one:
    // the customer sees the Side the authority names and moves themselves.
    const placement = makePlacement({
      sides: [
        makeSide({ id: 'side-empty', code: 'a', displayOrder: 1, areas: [] }),
        makeSide({ id: 'side-real', code: 'b', displayOrder: 2 }),
      ],
    });

    expect(initialSideOf(placement)?.id).toBe('side-empty');
    expect(initialAreaOf(initialSideOf(placement))).toBeUndefined();
  });

  it('takes the canonical first Side when several are usable', () => {
    const placement = makePlacement({
      sides: [
        makeSide({ id: 'side-late', code: 'z', displayOrder: 2 }),
        makeSide({ id: 'side-first', code: 'a', displayOrder: 1 }),
      ],
    });

    expect(initialSideOf(placement)?.id).toBe('side-first');
  });

  it('resolves an Area only inside its own Side', () => {
    const placement = makePlacement({
      sides: [
        makeSide({ id: 'side-1', areas: [makeArea({ id: 'area-1' })] }),
        makeSide({ id: 'side-2', code: 'mat-sau', areas: [makeArea({ id: 'area-2' })] }),
      ],
    });
    const first = placement.sides[0];

    expect(findArea(first, 'area-2')).toBeUndefined();
  });

  it('produces a triple only when both are resolved', () => {
    const placement = makePlacement();
    const side = initialSideOf(placement);

    expect(tripleOf(placement, side, undefined)).toBeUndefined();
    expect(tripleOf(placement, side, initialAreaOf(side))).toEqual({
      productId: PRODUCT_ID,
      productSideId: 'side-1',
      embroideryAreaId: 'area-1',
    });
  });

  it('names a placement by public codes for bootstrap', () => {
    const placement = makePlacement();
    const side = initialSideOf(placement);

    expect(codesOf(side, initialAreaOf(side))).toEqual({
      sideCode: 'mat-truoc',
      areaCode: 'nguc-trai',
    });
  });
});

describe('the selection cascade', () => {
  const SIDE_ONE = makeSide({ id: 'side-1', areas: [makeArea({ id: 'area-1' })] });
  const twoSides = makePlacement({
    sides: [
      SIDE_ONE,
      makeSide({
        id: 'side-2',
        code: 'mat-sau',
        displayOrder: 2,
        areas: [
          makeArea({ id: 'area-2', code: 'lung' }),
          makeArea({ id: 'area-3', code: 'vai', displayOrder: 2 }),
        ],
      }),
    ],
  });

  function resolved() {
    return studioSelectionReducer(EMPTY_STUDIO_SELECTION, {
      type: 'reconcile',
      placement: twoSides,
    });
  }

  it('reconciles an empty selection to the deterministic first pair', () => {
    expect(resolved()).toEqual({ sideId: 'side-1', areaId: 'area-1', templateSlug: null });
  });

  it('clears Area and Template when the Side changes', () => {
    const withTemplate = studioSelectionReducer(resolved(), {
      type: 'select-template',
      templateSlug: 'hoa-sen',
    });

    const moved = studioSelectionReducer(withTemplate, {
      type: 'select-side',
      placement: twoSides,
      sideId: 'side-2',
    });

    // A new Side, a deterministic Area on that Side, and no Template. There is
    // no transition that could leave the old Area or Template behind.
    expect(moved).toEqual({ sideId: 'side-2', areaId: 'area-2', templateSlug: null });
  });

  it('clears the Template when the Area changes', () => {
    const onSide2 = studioSelectionReducer(resolved(), {
      type: 'select-side',
      placement: twoSides,
      sideId: 'side-2',
    });
    const chosen = studioSelectionReducer(onSide2, {
      type: 'select-template',
      templateSlug: 'hoa-sen',
    });

    expect(
      studioSelectionReducer(chosen, {
        type: 'select-area',
        placement: twoSides,
        areaId: 'area-3',
      }),
    ).toEqual({ sideId: 'side-2', areaId: 'area-3', templateSlug: null });
  });

  it('ignores an Area belonging to another Side', () => {
    const state = resolved();

    expect(
      studioSelectionReducer(state, { type: 'select-area', placement: twoSides, areaId: 'area-2' }),
    ).toBe(state);
  });

  it('re-derives when the selected Side is retired between reads', () => {
    const chosen = studioSelectionReducer(
      studioSelectionReducer(resolved(), {
        type: 'select-side',
        placement: twoSides,
        sideId: 'side-2',
      }),
      { type: 'select-template', templateSlug: 'hoa-sen' },
    );

    const afterRetirement = studioSelectionReducer(chosen, {
      type: 'reconcile',
      placement: makePlacement({ sides: [SIDE_ONE] }),
    });

    expect(afterRetirement).toEqual({ sideId: 'side-1', areaId: 'area-1', templateSlug: null });
  });

  it('re-derives the Area on the same Side when only the Area is retired', () => {
    const onArea3 = studioSelectionReducer(
      studioSelectionReducer(resolved(), {
        type: 'select-side',
        placement: twoSides,
        sideId: 'side-2',
      }),
      { type: 'select-area', placement: twoSides, areaId: 'area-3' },
    );

    const shrunk = makePlacement({
      sides: [
        SIDE_ONE,
        makeSide({
          id: 'side-2',
          code: 'mat-sau',
          displayOrder: 2,
          areas: [makeArea({ id: 'area-2', code: 'lung' })],
        }),
      ],
    });

    expect(studioSelectionReducer(onArea3, { type: 'reconcile', placement: shrunk })).toEqual({
      sideId: 'side-2',
      areaId: 'area-2',
      templateSlug: null,
    });
  });

  it('keeps a still-valid selection across a re-read', () => {
    const state = resolved();
    expect(studioSelectionReducer(state, { type: 'reconcile', placement: twoSides })).toBe(state);
  });
});

describe('a selected Side that carries no Area (IMP-D041 PO-04)', () => {
  const EMPTY_FIRST = makePlacement({
    sides: [
      makeSide({ id: 'side-empty', code: 'a', displayOrder: 1, areas: [] }),
      makeSide({
        id: 'side-real',
        code: 'b',
        displayOrder: 2,
        areas: [makeArea({ id: 'area-9', code: 'lung' })],
      }),
    ],
  });

  function landed() {
    return studioSelectionReducer(EMPTY_STUDIO_SELECTION, {
      type: 'reconcile',
      placement: EMPTY_FIRST,
    });
  }

  it('lands on the first Side with no Area selected', () => {
    expect(landed()).toEqual({ sideId: 'side-empty', areaId: null, templateSlug: null });
  });

  it('produces no triple and no codes, so nothing downstream is addressable', () => {
    const side = findSide(EMPTY_FIRST, 'side-empty');

    expect(tripleOf(EMPTY_FIRST, side, undefined)).toBeUndefined();
    expect(codesOf(side, undefined)).toBeUndefined();
  });

  it('auto-selects the Area when the customer moves to the usable Side', () => {
    expect(
      studioSelectionReducer(landed(), {
        type: 'select-side',
        placement: EMPTY_FIRST,
        sideId: 'side-real',
      }),
    ).toEqual({ sideId: 'side-real', areaId: 'area-9', templateSlug: null });
  });

  it('stays on the empty Side when the customer chooses it again', () => {
    const onReal = studioSelectionReducer(landed(), {
      type: 'select-side',
      placement: EMPTY_FIRST,
      sideId: 'side-real',
    });

    const back = studioSelectionReducer(onReal, {
      type: 'select-side',
      placement: EMPTY_FIRST,
      sideId: 'side-empty',
    });

    // The customer chose this Side. Nothing bounces them off it, and a later
    // re-read of the manifest does not either.
    expect(back).toEqual({ sideId: 'side-empty', areaId: null, templateSlug: null });
    expect(studioSelectionReducer(back, { type: 'reconcile', placement: EMPTY_FIRST })).toBe(back);
  });

  it('keeps a still-present Side whose Areas were all retired', () => {
    const state = studioSelectionReducer(EMPTY_STUDIO_SELECTION, {
      type: 'reconcile',
      placement: makePlacement({
        sides: [makeSide({ id: 'side-1', areas: [makeArea({ id: 'area-1' })] })],
      }),
    });
    expect(state.areaId).toBe('area-1');

    const emptied = studioSelectionReducer(state, {
      type: 'reconcile',
      placement: makePlacement({ sides: [makeSide({ id: 'side-1', areas: [] })] }),
    });

    // Present-but-unusable is not gone: the Side is kept and only the Area
    // clears. Only a Side that actually left the manifest moves the selection.
    expect(emptied).toEqual({ sideId: 'side-1', areaId: null, templateSlug: null });
  });
});

describe('keyset continuation and the preview reference', () => {
  it('continues only when hasNext and a usable cursor both exist', () => {
    expect(nextCursorOf(makeTemplatePage([makeTemplate()], 'cur-1'))).toBe('cur-1');
    expect(nextCursorOf(makeTemplatePage([makeTemplate()]))).toBeUndefined();
    // A page claiming a successor without supplying its cursor is not a page
    // the picker may continue from.
    expect(nextCursorOf({ items: [], hasNext: true })).toBeUndefined();
    expect(nextCursorOf(undefined)).toBeUndefined();
  });

  it('flattens pages in server order and drops a repeated slug', () => {
    const pages = [
      makeTemplatePage([makeTemplate({ slug: 'a' }), makeTemplate({ slug: 'b' })], 'c1'),
      makeTemplatePage([makeTemplate({ slug: 'b' }), makeTemplate({ slug: 'c' })]),
    ];

    expect(flattenTemplatePages(pages).map((row) => row.slug)).toEqual(['a', 'b', 'c']);
  });

  it('takes the preview asset from the published version document', () => {
    const detail = makeTemplateDetail({ document: makeDocument(['asset-9', 'asset-10']) });

    expect(previewReferenceOf(detail)).toEqual({
      templateSlug: 'hoa-sen',
      version: 2,
      assetId: 'asset-9',
    });
  });

  it('reports a text-only Template as having no preview reference', () => {
    expect(previewReferenceOf(makeTemplateDetail({ document: makeDocument([]) }))).toBeUndefined();
  });
});
