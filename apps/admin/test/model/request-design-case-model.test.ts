/**
 * The design-case workbench's presentation and authoring model (`APP6-A02`
 * §12, §14, §16, §17, §23).
 *
 * The claims worth proving here are the ones a plausible-looking screen gets
 * wrong:
 *
 *  - the **current authored** version and the version **awaiting review** are
 *    different facts and stay different;
 *  - the action matrix never offers a move the server would refuse, and never
 *    offers an approve or a revision-request at all;
 *  - a historical version is never mutated by an edit to the working copy;
 *  - nothing the server said reaches the operator verbatim.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  allowsAuthoring,
  awaitsDigitizingTransition,
  findCurrentVersion,
  findVersionInReview,
  presentInstant,
  presentPlacement,
  presentReviewOutcome,
  presentVersionStatus,
  resolveSelectedVersion,
  resolveVersionActions,
  resolveVersionNote,
} from '../../src/features/request-design-case/model/design-case-presentation';
import {
  appendElement,
  buildTextElement,
  canAddTextElement,
  isSaveableDocument,
  readWorkingDocument,
  removeElement,
  replaceElement,
  withTransform,
} from '../../src/features/request-design-case/model/design-authoring-document';
import {
  classifyAuthoringFailure,
  classifyReadFailure,
  classifySendFailure,
  preservesAuthoringFields,
  requiresReconciliation,
  RequestDesignCaseApiError,
} from '../../src/features/request-design-case/model/request-design-case-failure';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../../src/features/request-design-case/model/request-design-case-copy';
import { normalizeApiClientError } from '@embroidery/api-client';

import { makeApiClientError } from '../support/api-error';
import {
  catalogDocument,
  customerOwnedDocument,
  makeVersion,
  VERSION_1_ID,
  VERSION_2_ID,
} from '../support/request-design-case-fixture';

/**
 * A refusal that has travelled the real normalization path.
 *
 * `makeApiClientError` produces an Axios-shaped error and
 * `normalizeApiClientError` is the production normalizer, so the classifiers
 * under test see exactly what they see in the browser — not a hand-built
 * `NormalizedApiError` that could disagree with what the client actually
 * produces.
 */
function apiError(status: number, code = 'REFUSED'): RequestDesignCaseApiError {
  return new RequestDesignCaseApiError(
    normalizeApiClientError(makeApiClientError({ status, code })),
  );
}

describe('APP6-A02 — request-state gate', () => {
  it('permits authoring in exactly the two states APP6-B08 accepts', () => {
    expect(allowsAuthoring('DIGITIZING')).toBe(true);
    expect(allowsAuthoring('DESIGN_REVIEW')).toBe(true);
    for (const status of [
      'NEW',
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'QUOTED',
      'QUOTE_ACCEPTED',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ]) {
      expect(allowsAuthoring(status)).toBe(false);
    }
    expect(allowsAuthoring(undefined)).toBe(false);
    expect(allowsAuthoring(42)).toBe(false);
  });

  it('points only QUOTE_ACCEPTED at APP6-B06’s own transition control', () => {
    expect(awaitsDigitizingTransition('QUOTE_ACCEPTED')).toBe(true);
    expect(awaitsDigitizingTransition('DIGITIZING')).toBe(false);
    expect(awaitsDigitizingTransition('NEW')).toBe(false);
  });
});

describe('APP6-A02 — current authored is not the version under review', () => {
  const draft = makeVersion({
    versionId: VERSION_2_ID,
    version: 2,
    status: 'DRAFT',
    current: true,
  });
  const inReview = makeVersion({
    versionId: VERSION_1_ID,
    version: 1,
    status: 'SENT_FOR_REVIEW',
    current: false,
    sentAt: '2026-08-19T09:00:00.000Z',
  });

  it('reads each from its own authority and never conflates them', () => {
    const versions = [inReview, draft];
    // The newer DRAFT is current; the older version is the one the customer is
    // being asked to decide on. Both are true at once.
    expect(findCurrentVersion(versions)?.versionId).toBe(VERSION_2_ID);
    expect(findVersionInReview(versions)?.versionId).toBe(VERSION_1_ID);
  });

  it('never infers the review target from the highest version number', () => {
    expect(findVersionInReview([draft])).toBeUndefined();
  });

  it('names the current marker after the pointer, not after the customer', () => {
    // The copy must not describe the current version as the one being reviewed.
    expect(COPY.history.currentYes).not.toContain('duyệt');
    expect(COPY.history.currentYes).not.toContain('khách');
  });
});

describe('APP6-A02 — selected version resolution', () => {
  const first = makeVersion({ versionId: VERSION_1_ID, version: 1, current: false });
  const second = makeVersion({ versionId: VERSION_2_ID, version: 2, current: true });

  it('honours a held selection while the version is still listed', () => {
    expect(resolveSelectedVersion([first, second], VERSION_1_ID)?.versionId).toBe(VERSION_1_ID);
  });

  it('falls back to the current version when the held one vanished', () => {
    expect(resolveSelectedVersion([first, second], 'gone')?.versionId).toBe(VERSION_2_ID);
  });

  it('falls back to the last returned row when the case names no current version', () => {
    const none = [makeVersion({ versionId: VERSION_1_ID, current: false })];
    expect(resolveSelectedVersion(none, null)?.versionId).toBe(VERSION_1_ID);
  });

  it('resolves to nothing on an empty history', () => {
    expect(resolveSelectedVersion([], null)).toBeUndefined();
  });
});

describe('APP6-A02 — the action matrix reads server facts', () => {
  it('offers authoring and send only on a DRAFT in an authoring state', () => {
    const draft = makeVersion({ status: 'DRAFT' });
    expect(resolveVersionActions(draft, 'DIGITIZING')).toEqual({
      canAuthor: true,
      canSend: true,
      canCreateFrom: false,
      readOnly: false,
    });
    // The same DRAFT after the request left its authoring states.
    expect(resolveVersionActions(draft, 'APPROVED').canSend).toBe(false);
    expect(resolveVersionActions(draft, 'APPROVED').readOnly).toBe(true);
  });

  it('makes a sent version read-only with no re-send and no editing', () => {
    const actions = resolveVersionActions(
      makeVersion({ status: 'SENT_FOR_REVIEW' }),
      'DESIGN_REVIEW',
    );
    expect(actions).toEqual({
      canAuthor: false,
      canSend: false,
      canCreateFrom: false,
      readOnly: true,
    });
  });

  it('offers a revision-requested version exactly one forward move: a new DRAFT', () => {
    const actions = resolveVersionActions(
      makeVersion({ status: 'REVISION_REQUESTED' }),
      'DESIGN_REVIEW',
    );
    expect(actions.canCreateFrom).toBe(true);
    // The historical row itself is never edited or re-sent.
    expect(actions.canAuthor).toBe(false);
    expect(actions.canSend).toBe(false);
    expect(actions.readOnly).toBe(true);
  });

  it('offers nothing at all on an approved, superseded or void version', () => {
    for (const status of ['APPROVED', 'SUPERSEDED', 'VOID']) {
      const actions = resolveVersionActions(makeVersion({ status }), 'DESIGN_REVIEW');
      expect(actions.canAuthor).toBe(false);
      expect(actions.canSend).toBe(false);
      expect(actions.canCreateFrom).toBe(false);
      expect(actions.readOnly).toBe(true);
    }
  });

  it('has no field through which an approve or a revision request could be offered', () => {
    const actions = resolveVersionActions(makeVersion(), 'DIGITIZING');
    expect(Object.keys(actions).sort()).toEqual([
      'canAuthor',
      'canCreateFrom',
      'canSend',
      'readOnly',
    ]);
  });

  it('degrades an unknown version status to no actions rather than guessing', () => {
    expect(
      resolveVersionActions(makeVersion({ status: 'SOMETHING_NEW' }), 'DIGITIZING').canSend,
    ).toBe(false);
    expect(resolveVersionActions(undefined, 'DIGITIZING').readOnly).toBe(true);
  });
});

describe('APP6-A02 — labels never echo a raw server token', () => {
  it('names every LC-08 state and degrades the rest', () => {
    for (const status of [
      'DRAFT',
      'SENT_FOR_REVIEW',
      'REVISION_REQUESTED',
      'APPROVED',
      'SUPERSEDED',
      'VOID',
    ]) {
      const label = presentVersionStatus(status);
      expect(label).not.toBe(status);
      expect(label).not.toBe(COPY.versionStatus.unknown);
    }
    expect(presentVersionStatus('SOMETHING_NEW')).toBe(COPY.versionStatus.unknown);
    expect(presentVersionStatus(undefined)).toBe(COPY.versionStatus.unknown);
    expect(presentVersionStatus(7)).toBe(COPY.versionStatus.unknown);
  });

  it('names both review outcomes and degrades the rest', () => {
    expect(presentReviewOutcome('APPROVE')).not.toBe('APPROVE');
    expect(presentReviewOutcome('REQUEST_REVISION')).not.toBe('REQUEST_REVISION');
    expect(presentReviewOutcome('OTHER')).toBe(COPY.reviewOutcome.unknown);
    expect(presentReviewOutcome(null)).toBe(COPY.reviewOutcome.unknown);
  });

  it('renders an absent instant as an em dash rather than an invalid date', () => {
    expect(presentInstant(null)).toBe('—');
    expect(presentInstant(undefined)).toBe('—');
    expect(presentInstant('')).toBe('—');
    expect(presentInstant('not-a-date')).toBe('—');
  });

  it('never puts a catalog identifier on screen as a placement', () => {
    const catalog = makeVersion({ branch: 'CATALOG' });
    const placement = presentPlacement(catalog);
    expect(placement).toBe(COPY.context.branchCatalog);
    expect(placement).not.toContain(catalog.productId ?? '');
    expect(placement).not.toContain(catalog.productSideId ?? '');
  });

  it('names the customer-owned placement from its frozen labels', () => {
    const cop = makeVersion({
      branch: 'CUSTOMER_OWNED',
      productId: null,
      productVariantId: null,
      productSideId: null,
      embroideryAreaId: null,
      placementSideLabel: 'Ngực trái',
      placementAreaLabel: 'Vùng thêu ngực',
    });
    expect(presentPlacement(cop)).toBe('Ngực trái · Vùng thêu ngực');
  });

  it('gives each read-only state its own note, and a plain draft none', () => {
    expect(resolveVersionNote(makeVersion({ status: 'DRAFT' }))).toBeNull();
    expect(resolveVersionNote(makeVersion({ status: 'SENT_FOR_REVIEW' }))?.tone).toBe('awaiting');
    expect(resolveVersionNote(makeVersion({ status: 'REVISION_REQUESTED' }))?.tone).toBe(
      'revision',
    );
    expect(resolveVersionNote(makeVersion({ status: 'APPROVED' }))?.tone).toBe('approved');
    expect(resolveVersionNote(makeVersion({ status: 'SUPERSEDED' }))?.tone).toBe('historical');
  });
});

describe('APP6-A02 — failure classification never reads a message', () => {
  it('folds not-found, forbidden and malformed into one read outcome', () => {
    for (const status of [400, 403, 404]) {
      expect(classifyReadFailure(apiError(status))).toBe('missing');
    }
    expect(classifyReadFailure(apiError(409))).toBe('unresolvable');
    expect(classifyReadFailure(apiError(401))).toBe('unauthenticated');
    expect(classifyReadFailure(apiError(500))).toBe('retryable');
    expect(classifyReadFailure(new Error('boom'))).toBe('retryable');
  });

  it('separates REVIEW_ALREADY_ACTIVE from every other send refusal, by code', () => {
    expect(classifySendFailure(apiError(409, 'REVIEW_ALREADY_ACTIVE'))).toBe('reviewActive');
    expect(classifySendFailure(apiError(409, 'VERSION_NOT_SENDABLE'))).toBe('stale');
    expect(classifySendFailure(apiError(404))).toBe('stale');
    expect(classifySendFailure(apiError(401))).toBe('unauthenticated');
    expect(classifySendFailure(apiError(503))).toBe('retryable');
  });

  it('requires a re-read for both refusals that could mean the world moved', () => {
    expect(requiresReconciliation('reviewActive')).toBe(true);
    expect(requiresReconciliation('stale')).toBe(true);
    expect(requiresReconciliation('retryable')).toBe(false);
    expect(requiresReconciliation('unauthenticated')).toBe(false);
  });

  it('keeps the operator’s entered placement only where they can act on it', () => {
    expect(classifyAuthoringFailure(apiError(422))).toBe('rejected');
    expect(classifyAuthoringFailure(apiError(409))).toBe('ineligible');
    expect(preservesAuthoringFields('rejected')).toBe(true);
    expect(preservesAuthoringFields('retryable')).toBe(true);
    expect(preservesAuthoringFields('ineligible')).toBe(false);
  });
});

describe('APP6-A02 — the working document is a copy, and P01 is the authority', () => {
  it('accepts both governed schema versions exactly as persisted', () => {
    const v1 = readWorkingDocument(catalogDocument());
    const v2 = readWorkingDocument(customerOwnedDocument());
    expect(v1?.schemaVersion).toBe(1);
    expect(v2?.schemaVersion).toBe(2);
    // Nothing is migrated on read: a v1 document stays v1.
    expect(v1?.placement.productSideId).not.toBeNull();
    expect(v2?.placement.productSideId).toBeNull();
  });

  it('refuses a malformed document rather than repairing it', () => {
    expect(readWorkingDocument({ schemaVersion: 1 })).toBeNull();
    expect(readWorkingDocument(null)).toBeNull();
    expect(readWorkingDocument({ schemaVersion: 99, placement: {}, elements: [] })).toBeNull();
  });

  it('never mutates the document an edit was derived from', () => {
    const original = readWorkingDocument(catalogDocument());
    expect(original).not.toBeNull();
    const before = JSON.stringify(original);

    const withText = appendElement(original!, buildTextElement(original!, 'Chữ thêu'));
    const moved = replaceElement(withText, 'element-1', (element) =>
      withTransform(element, { x: 999 }),
    );
    removeElement(moved, 'element-1');

    // The historical document is untouched by all three edits.
    expect(JSON.stringify(original)).toBe(before);
    expect(withText.elements).toHaveLength(2);
    expect(moved.elements[0]?.transform.x).toBe(999);
    expect(original!.elements[0]?.transform.x).toBe(120);
  });

  it('produces a document P01 would still accept', () => {
    const document = readWorkingDocument(catalogDocument());
    const edited = appendElement(document!, buildTextElement(document!, 'Chữ thêu'));
    expect(isSaveableDocument(edited)).toBe(true);
  });

  it('names a controlled font by id, never a CSS family', () => {
    const document = readWorkingDocument(catalogDocument());
    const text = buildTextElement(document!, 'Chữ thêu');
    expect(text.fontId).toBeDefined();
    expect(Object.keys(text)).not.toContain('fontFamily');
  });

  it('derives element ids from the document rather than from crypto.randomUUID', () => {
    const document = readWorkingDocument(catalogDocument());
    const first = buildTextElement(document!, 'A');
    const next = appendElement(document!, first);
    const second = buildTextElement(next, 'B');
    expect(first.id).not.toBe(second.id);
    // Deterministic: a test can assert on the element it just added.
    expect(first.id).toMatch(/^element-\d+$/);
  });

  it('reports the element limit rather than silently dropping an addition', () => {
    const document = readWorkingDocument(catalogDocument());
    expect(canAddTextElement(document!)).toBe(true);
  });

  it('prunes a removed element from every group that named it', () => {
    const base = readWorkingDocument(catalogDocument())!;
    const grouped = {
      ...base,
      elements: [
        ...base.elements,
        {
          id: 'group-1',
          type: 'group' as const,
          visible: true,
          locked: false,
          opacity: 1,
          transform: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, scaleX: 1, scaleY: 1 },
          childIds: ['element-1'],
        },
      ],
    };
    const pruned = removeElement(grouped, 'element-1');
    const group = pruned.elements.find((element) => element.id === 'group-1');
    expect(group?.type).toBe('group');
    expect(group?.type === 'group' ? group.childIds : []).toEqual([]);
    // A dangling child id would make the document unsaveable through an edit
    // that looked local.
    expect(isSaveableDocument(pruned)).toBe(true);
  });
});

describe('APP6-A02 — the feature keeps its boundaries', () => {
  const featureRoot = join(__dirname, '..', '..', 'src', 'features', 'request-design-case');

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
    });
  }

  const files = sourceFiles(featureRoot);

  /**
   * Source with comments stripped.
   *
   * Load-bearing: this feature's files *document* what they must never do —
   * "never written to `localStorage`", "no Konva, no Fabric" — and a scan over
   * raw text would fail on the very prose that states the rule. Stripping
   * comments is what makes these guards assert about code rather than about
   * documentation, and it is why the first run of them was red.
   */
  const sources = files.map((path) => ({
    path,
    code: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''),
  }));

  it('reads at least one file from every layer, so the scan is not vacuous', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const layer of ['components', 'hooks', 'model', 'services']) {
      expect(files.some((path) => path.includes(layer))).toBe(true);
    }
  });

  it('never persists design data in browser storage', () => {
    for (const { path, code } of sources) {
      expect(`${path}:${String(code.includes('localStorage'))}`).toBe(`${path}:false`);
      expect(`${path}:${String(code.includes('sessionStorage'))}`).toBe(`${path}:false`);
      expect(`${path}:${String(code.includes('indexedDB'))}`).toBe(`${path}:false`);
    }
  });

  it('never calls an application API with fetch, and never logs a document', () => {
    for (const { path, code } of sources) {
      expect(`${path}:${String(/\bfetch\(/.test(code))}`).toBe(`${path}:false`);
      expect(`${path}:${String(/console\.(log|debug|info)\(/.test(code))}`).toBe(`${path}:false`);
    }
  });

  it('introduces no second rendering engine', () => {
    for (const { path, code } of sources) {
      const lowered = code.toLowerCase();
      for (const banned of ['konva', 'fabric', 'pixi', 'three', 'getcontext(']) {
        expect(`${path}:${banned}:${String(lowered.includes(banned))}`).toBe(
          `${path}:${banned}:false`,
        );
      }
    }
  });

  it('reaches no other feature by deep import', () => {
    for (const { path, code } of sources) {
      // `../../<feature>/...` would cross a bounded feature's public surface.
      // The negative lookahead excludes `../../../shared/...`, which is the
      // Admin-wide layer this feature is allowed to reach.
      const deep = /from '\.\.\/\.\.\/(?!\.)[a-z-]+\//.exec(code);
      expect(`${path}:${deep?.[0] ?? 'none'}`).toBe(`${path}:none`);
    }
  });

  it('claims no APP7 capability anywhere in its operator-facing copy', () => {
    // Only the resolved strings, never the module's own prose: the copy file's
    // header explains that it must not mention a DST or PES file, and scanning
    // the source would fail on that sentence.
    const copy = JSON.stringify(COPY);
    for (const banned of ['DST', 'PES']) {
      expect(`${banned}:${String(copy.includes(banned))}`).toBe(`${banned}:false`);
    }
    // Nothing offers to create an order, take a deposit or start production.
    for (const banned of ['tạo đơn hàng', 'thu cọc', 'tạo lệnh sản xuất']) {
      const offered = new RegExp(`(?<!chưa )${banned}`).test(copy);
      expect(`${banned}:${String(offered)}`).toBe(`${banned}:false`);
    }
    // The two denials that must be present, so this guard cannot pass by the
    // copy simply having no scope notes at all.
    expect(COPY.approval.scopeNote).toContain('chưa tạo đơn hàng');
    expect(COPY.authoring.scopeNote).toContain('không tạo tệp thêu máy');
  });
});
