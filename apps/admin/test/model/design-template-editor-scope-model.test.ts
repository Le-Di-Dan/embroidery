/**
 * The initial scope assignment's pure model (`APP3-A03-C1`).
 *
 * Split from `design-template-editor-model.test.ts` rather than appended to it:
 * these cases answer a different question — *may this Template be assigned a
 * scope, and which choices are legal* — and the two together crossed the
 * 600-line test limit. The split is by subject, not by line count.
 *
 * The cases worth reading twice are about **invalidation**. A Product change
 * that left a stale Side behind would submit a triple whose parts come from two
 * Products, which `IMP-D042` PO-06 calls wrong rather than incomplete — and no
 * rendered assertion can see it, because the stale value never appears on
 * screen.
 */
import { normalizeApiClientError } from '@embroidery/api-client';

import {
  classifyAssignScopeFailure,
  scopeRaceOutcome,
  TemplateEditorApiError,
} from '../../src/features/design-template-editor/model/editor-failure';
import {
  isInitiallyAssignable,
  resolveEditorSource,
} from '../../src/features/design-template-editor/model/editor-source';
import {
  completeSelection,
  EMPTY_SCOPE_SELECTION,
  scopeSelectionReducer,
  selectableAreas,
  selectableSides,
  type ScopeSelection,
} from '../../src/features/design-template-editor/model/scope-selection';
import { makeApiClientError } from '../support/api-error';
import {
  EDITOR_SIDE_ID,
  makeDocument,
  makePlacement,
  makeUnversionedDetail,
  makeVersionedDetail,
} from '../support/design-template-editor-fixture';

function apiError(status: number, code: string): unknown {
  return new TemplateEditorApiError(normalizeApiClientError(makeApiClientError({ status, code })));
}

describe('initial scope assignability (APP3-A03-C1)', () => {
  it('accepts only an unscoped, versionless DRAFT', () => {
    expect(isInitiallyAssignable(makeUnversionedDetail({ scope: undefined }))).toBe(true);
  });

  it('refuses a Template that already has a scope', () => {
    // `APP3-B03B` publishes no rescope, so a scoped Template is not a candidate
    // and offering the selector would offer a choice ending in a 409.
    expect(isInitiallyAssignable(makeUnversionedDetail())).toBe(false);
  });

  it('refuses a Template that already has a version', () => {
    expect(
      isInitiallyAssignable(makeVersionedDetail(1, makeDocument(), { scope: undefined })),
    ).toBe(false);
  });

  for (const status of ['PUBLISHED', 'ARCHIVED']) {
    it(`refuses a ${status} Template`, () => {
      expect(isInitiallyAssignable(makeUnversionedDetail({ scope: undefined, status }))).toBe(
        false,
      );
    });
  }

  it('separates the assignable branch from the dead-end one', () => {
    const assignable = resolveEditorSource({
      detail: makeUnversionedDetail({ scope: undefined }),
      detailLoading: false,
      detailFailure: null,
      placement: { placement: undefined, isLoading: false, failed: false, retry: () => undefined },
    });
    expect(assignable.kind).toBe('scope-assignable');

    const deadEnd = resolveEditorSource({
      detail: makeUnversionedDetail({ scope: undefined, status: 'ARCHIVED' }),
      detailLoading: false,
      detailFailure: null,
      placement: { placement: undefined, isLoading: false, failed: false, retry: () => undefined },
    });
    expect(deadEnd.kind).toBe('unscoped');
  });
});

describe('the scope selection model', () => {
  const placement = makePlacement();

  it('clears the Side and the Area when the Product changes', () => {
    const chosen: ScopeSelection = {
      productId: 'p1',
      productSideId: 's1',
      embroideryAreaId: 'a1',
    };

    const next = scopeSelectionReducer(chosen, { type: 'SELECT_PRODUCT', productId: 'p2' });

    // Both dependents belonged to the previous Product; keeping either is how a
    // triple ends up with parts from two Products.
    expect(next).toEqual({ productId: 'p2', productSideId: null, embroideryAreaId: null });
  });

  it('clears the Area when the Side changes', () => {
    const chosen: ScopeSelection = {
      productId: 'p1',
      productSideId: 's1',
      embroideryAreaId: 'a1',
    };

    expect(scopeSelectionReducer(chosen, { type: 'SELECT_SIDE', productSideId: 's2' })).toEqual({
      productId: 'p1',
      productSideId: 's2',
      embroideryAreaId: null,
    });
  });

  it('offers no retired Side', () => {
    const withRetired = makePlacement({
      sides: [{ ...placement.sides[0], retiredAt: '2026-08-01T00:00:00.000Z' }],
    });
    expect(selectableSides(withRetired)).toEqual([]);
    expect(selectableSides(placement)).toHaveLength(1);
  });

  it('offers no retired Area', () => {
    const withRetired = makePlacement({
      sides: [
        {
          ...placement.sides[0],
          areas: [
            { ...(placement.sides[0]?.areas[0] ?? {}), retiredAt: '2026-08-01T00:00:00.000Z' },
          ],
        },
      ],
    });
    expect(selectableAreas(withRetired, EDITOR_SIDE_ID)).toEqual([]);
  });

  it('offers only Areas of the chosen Side, never a sibling Side\u2019s', () => {
    const twoSides = makePlacement({
      sides: [placement.sides[0], { ...placement.sides[0], id: 'side-2', code: 'back', areas: [] }],
    });

    expect(selectableAreas(twoSides, EDITOR_SIDE_ID)).toHaveLength(1);
    // Read from that Side's own `areas`, so a sibling's Area is unreachable
    // rather than merely filtered.
    expect(selectableAreas(twoSides, 'side-2')).toEqual([]);
  });

  it('yields a triple only when all three are chosen', () => {
    expect(completeSelection(EMPTY_SCOPE_SELECTION)).toBeNull();
    expect(
      completeSelection({ productId: 'p', productSideId: 's', embroideryAreaId: null }),
    ).toBeNull();
    expect(
      completeSelection({ productId: 'p', productSideId: 's', embroideryAreaId: 'a' }),
    ).toEqual({
      productId: 'p',
      productSideId: 's',
      embroideryAreaId: 'a',
    });
  });
});

describe('assignment failure classification', () => {
  it('treats a 409 as no-longer-assignable', () => {
    expect(classifyAssignScopeFailure(apiError(409, 'CONFLICT'))).toBe('not-assignable');
  });

  it('treats a 400 as an invalid triple', () => {
    expect(classifyAssignScopeFailure(apiError(400, 'BAD_REQUEST'))).toBe('scope-invalid');
  });

  it('accepts the winner scope when the re-read shows one', () => {
    expect(scopeRaceOutcome(true)).toBe('accept-server-scope');
    expect(scopeRaceOutcome(false)).toBe('blocked');
  });
});
