/**
 * `APP3-A04` — the readiness evaluation and the action matrix, as pure
 * functions.
 *
 * Rendered tests prove the panel shows what the model decided; these prove the
 * model decides the right thing. The distinction matters most for the third
 * state: `CHECKED_ON_PUBLISH` is not a styling concern, it is a claim about what
 * this client is entitled to assert.
 */
import {
  ACTIONS_BY_STATUS,
  actionsFor,
  isActionOffered,
  REASON_MAX_LENGTH,
  requiresReason,
  validateReason,
} from '../../src/features/design-template-lifecycle/model/lifecycle-actions';
import {
  evaluateReadiness,
  READINESS_CONDITIONS,
  type ResolvedScopeAuthority,
} from '../../src/features/design-template-lifecycle/model/lifecycle-readiness';
import {
  makeDocument,
  makeImageElement,
  makeTextElement,
  makeUnversionedDetail,
  makeVersionedDetail,
} from '../support/design-template-editor-fixture';

const scope: ResolvedScopeAuthority = {
  side: {
    productSideId: '01920000-0000-7000-8000-0000000000a1',
    code: 'front',
    retiredAt: null,
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    physicalWidthMm: 200,
    physicalHeightMm: 200,
    pxPerMm: 5,
  },
  area: {
    embroideryAreaId: '01920000-0000-7000-8000-0000000000b1',
    productSideId: '01920000-0000-7000-8000-0000000000a1',
    code: 'chest',
    retiredAt: null,
    boundXPx: 100,
    boundYPx: 100,
    boundWidthPx: 600,
    boundHeightPx: 600,
    maxWidthMm: 120,
    maxHeightMm: 120,
  },
  sideName: 'Mặt trước',
  areaName: 'Ngực trái',
};

const rowFor = (report: ReturnType<typeof evaluateReadiness>, condition: string) =>
  report.rows.find((row) => row.condition === condition);

describe('the action matrix', () => {
  it('offers exactly the LC-24 transitions each state permits', () => {
    expect(actionsFor('DRAFT')).toEqual(['publish', 'archive']);
    expect(actionsFor('PUBLISHED')).toEqual(['unpublish', 'archive']);
    expect(actionsFor('ARCHIVED')).toEqual(['restore']);
  });

  it('never offers a transition LC-24 does not recognise', () => {
    // The absences are the rule: restore only from ARCHIVED, and no direct
    // republication of an archived Template.
    expect(isActionOffered('ARCHIVED', 'publish')).toBe(false);
    expect(isActionOffered('ARCHIVED', 'unpublish')).toBe(false);
    expect(isActionOffered('PUBLISHED', 'restore')).toBe(false);
    expect(isActionOffered('DRAFT', 'restore')).toBe(false);
    expect(isActionOffered('DRAFT', 'unpublish')).toBe(false);
  });

  it('offers nothing for a status the contract does not define', () => {
    expect(actionsFor('SOMETHING_ELSE')).toEqual([]);
    expect(actionsFor(undefined)).toEqual([]);
    expect(Object.keys(ACTIONS_BY_STATUS)).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
  });

  it('requires a reason for archive and restore, and for neither of the others', () => {
    expect(requiresReason('archive')).toBe(true);
    expect(requiresReason('restore')).toBe(true);
    expect(requiresReason('publish')).toBe(false);
    expect(requiresReason('unpublish')).toBe(false);
  });

  it('trims a reason, refuses a blank one and mirrors the server bound', () => {
    expect(validateReason('  Hết mẫu  ')).toEqual({ ok: true, value: 'Hết mẫu' });
    expect(validateReason('   ')).toEqual({ ok: false, problem: 'blank' });
    expect(validateReason('')).toEqual({ ok: false, problem: 'blank' });
    expect(validateReason('x'.repeat(REASON_MAX_LENGTH))).toEqual({
      ok: true,
      value: 'x'.repeat(REASON_MAX_LENGTH),
    });
    expect(validateReason('x'.repeat(REASON_MAX_LENGTH + 1))).toEqual({
      ok: false,
      problem: 'too-long',
    });
    expect(REASON_MAX_LENGTH).toBe(500);
  });
});

describe('the readiness evaluation', () => {
  it('always returns all seven conditions, in the design order', () => {
    const report = evaluateReadiness({ detail: makeUnversionedDetail(), scope: undefined });
    expect(report.rows.map((row) => row.condition)).toEqual([...READINESS_CONDITIONS]);
  });

  it('proves a complete, valid, in-bounds, image-free Template', () => {
    const report = evaluateReadiness({
      detail: makeVersionedDetail(2, makeDocument()),
      scope,
    });

    for (const condition of READINESS_CONDITIONS) {
      expect(rowFor(report, condition)?.state).toBe('READY');
    }
    expect(report.blocked).toBe(false);
    expect(report.provenFailures).toBe(0);
  });

  it('defers media the moment the document references an Asset', () => {
    const report = evaluateReadiness({
      detail: makeVersionedDetail(2, makeDocument([makeTextElement(), makeImageElement()])),
      scope,
    });

    expect(rowFor(report, 'MEDIA_ELIGIBLE')?.state).toBe('CHECKED_ON_PUBLISH');
    // Deferred is not failed: it must not block, and must not be counted.
    expect(report.blocked).toBe(false);
    expect(report.provenFailures).toBe(0);
  });

  it('blocks on the two locally authoritative facts and on nothing else', () => {
    const noVersion = evaluateReadiness({ detail: makeUnversionedDetail(), scope: undefined });
    expect(rowFor(noVersion, 'IMMUTABLE_VERSION')?.state).toBe('NOT_READY');
    expect(noVersion.blocked).toBe(true);

    const noScope = evaluateReadiness({
      detail: makeVersionedDetail(1, makeDocument(), { scope: undefined }),
      scope: undefined,
    });
    expect(rowFor(noScope, 'SCOPE_COMPLETE')?.state).toBe('NOT_READY');
    expect(noScope.blocked).toBe(true);

    // A geometry failure is real, proven and reported — and still not blocking,
    // because the server is the guard and a client that blocked here would be a
    // second GRD-T01.
    const outside = evaluateReadiness({
      detail: makeVersionedDetail(
        1,
        makeDocument([
          makeTextElement({
            transform: {
              x: 5000,
              y: 5000,
              width: 100,
              height: 50,
              rotationDeg: 0,
              scaleX: 1,
              scaleY: 1,
            },
          }),
        ]),
      ),
      scope,
    });
    expect(rowFor(outside, 'WITHIN_AREA')?.state).toBe('NOT_READY');
    expect(outside.blocked).toBe(false);
  });

  it('distinguishes a scope not yet read from one that does not resolve', () => {
    const notRead = evaluateReadiness({
      detail: makeVersionedDetail(1, makeDocument()),
      scope: undefined,
    });
    expect(rowFor(notRead, 'SCOPE_ACTIVE')?.state).toBe('CHECKED_ON_PUBLISH');

    const retired = evaluateReadiness({
      detail: makeVersionedDetail(1, makeDocument()),
      scope: null,
    });
    expect(rowFor(retired, 'SCOPE_ACTIVE')?.state).toBe('NOT_READY');
  });

  it('stops evaluating geometry once its precondition fails', () => {
    const retired = evaluateReadiness({
      detail: makeVersionedDetail(1, makeDocument()),
      scope: null,
    });
    // Validating containment against an Area the Template may not claim would
    // produce an answer that means nothing.
    expect(rowFor(retired, 'PLACEMENT_MATCHES')?.state).toBe('CHECKED_ON_PUBLISH');
    expect(rowFor(retired, 'WITHIN_AREA')?.state).toBe('CHECKED_ON_PUBLISH');
  });

  it('reports an unsupported schema version as an invalid document', () => {
    const report = evaluateReadiness({
      detail: makeVersionedDetail(1, { ...makeDocument(), schemaVersion: 99 }),
      scope,
    });
    expect(rowFor(report, 'DOCUMENT_VALID')?.state).toBe('NOT_READY');
  });

  it('never marks an unevaluated condition as a pass', () => {
    const report = evaluateReadiness({ detail: makeUnversionedDetail(), scope: undefined });
    for (const row of report.rows) {
      if (row.state === 'READY') {
        expect(['IMMUTABLE_VERSION', 'SCOPE_COMPLETE']).toContain(row.condition);
      }
    }
  });
});
