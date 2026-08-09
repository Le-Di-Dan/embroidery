/**
 * The editor's pure model: the document constructor, scope resolution, failure
 * classification, the reducer and the source resolver.
 *
 * These are the rules that decide what may be saved and what a conflict means,
 * so they are proved without a DOM. A rule that is only visible through a
 * rendered component is a rule that can be lost to a layout change.
 */
import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  DESIGN_DOCUMENT_LIMITS,
  INTER_CONTROLLED_FONT,
  validateDesignDocumentStructure,
} from '@embroidery/design-document';

import {
  buildEmptyDocument,
  buildTextElement,
  canAddTextElement,
  nextElementId,
  removeElement,
} from '../../src/features/design-template-editor/model/editor-document';
import { resolveTemplateScope } from '../../src/features/design-template-editor/model/editor-scope';
import {
  classifySaveFailure,
  classifyLoadFailure,
  resolveConflictCause,
  TemplateEditorApiError,
} from '../../src/features/design-template-editor/model/editor-failure';
import {
  canSave,
  editorReducer,
  initialEditorState,
  saveChip,
} from '../../src/features/design-template-editor/model/editor-state';
import {
  rebuildDocument,
  resolveEditorSource,
  UNVERSIONED_EXPECTED_VERSION,
} from '../../src/features/design-template-editor/model/editor-source';
import { normalizeApiClientError } from '@embroidery/api-client';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  EDITOR_AREA_ID,
  EDITOR_SCOPE,
  EDITOR_SIDE_ID,
  makeDocument,
  makePlacement,
  makeTextElement,
  makeUnversionedDetail,
  makeVersionedDetail,
} from '../support/design-template-editor-fixture';

const placement = makePlacement();
const resolved = resolveTemplateScope(EDITOR_SCOPE, placement);
const scope = resolved.kind === 'resolved' ? resolved.scope : null;

function apiError(status: number, code: string): unknown {
  return new TemplateEditorApiError(normalizeApiClientError(makeApiClientError({ status, code })));
}

const idlePlacement = {
  placement,
  isLoading: false,
  failed: false,
  retry: () => undefined,
};

describe('scope resolution', () => {
  it('resolves the exact Side and Area the scope names, by id', () => {
    expect(scope?.side.id).toBe(EDITOR_SIDE_ID);
    expect(scope?.area.id).toBe(EDITOR_AREA_ID);
  });

  it('refuses to substitute another Side when the id no longer exists', () => {
    const result = resolveTemplateScope(
      { ...EDITOR_SCOPE, productSideId: 'missing-side' },
      placement,
    );

    // The Product still has exactly one Side. Falling back to it would author a
    // document against geometry the Template does not point at.
    expect(result.kind).toBe('unresolved');
  });

  it('refuses to substitute another Area when the id no longer exists', () => {
    const result = resolveTemplateScope(
      { ...EDITOR_SCOPE, embroideryAreaId: 'missing-area' },
      placement,
    );
    expect(result.kind).toBe('unresolved');
  });

  it('still resolves a retired Side, because retirement is not deletion', () => {
    const retired = makePlacement({
      sides: [{ ...placement.sides[0], retiredAt: '2026-08-01T00:00:00.000Z' }],
    });
    expect(resolveTemplateScope(EDITOR_SCOPE, retired).kind).toBe('resolved');
  });
});

describe('the empty document', () => {
  it('is built from the Side, and is valid under APP3-P01 itself', () => {
    const built = buildEmptyDocument(scope!);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.schemaVersion).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
    expect(built.value.elements).toEqual([]);
    // Every placement value is the Side's own, not a computed one. `pxPerMm`
    // especially: deriving it from the width ratio would be a second conversion
    // authority (IMP-D045).
    expect(built.value.placement).toEqual({
      productSideId: EDITOR_SIDE_ID,
      embroideryAreaId: EDITOR_AREA_ID,
      canvasWidthPx: 1000,
      canvasHeightPx: 1000,
      physicalWidthMm: 200,
      physicalHeightMm: 200,
      pxPerMm: 5,
    });
  });

  it('refuses a Side whose canvas is not a usable positive integer', () => {
    const broken = makePlacement({
      sides: [{ ...placement.sides[0], imageWidthPx: 0 }],
    });
    const brokenScope = resolveTemplateScope(EDITOR_SCOPE, broken);
    expect(brokenScope.kind).toBe('resolved');
    if (brokenScope.kind !== 'resolved') return;

    // Reported, never rounded: a rounded canvas is a document that misstates the
    // Side it claims to be authored against.
    expect(buildEmptyDocument(brokenScope.scope).ok).toBe(false);
  });

  it('names the controlled font by id, never a CSS family', () => {
    const element = buildTextElement(makeDocument([]), scope!.area, 'Chữ');

    expect(element.fontId).toBe(INTER_CONTROLLED_FONT.fontId);
    expect(JSON.stringify(element)).not.toContain('sans-serif');
    expect(JSON.stringify(element)).not.toContain('Inter,');
  });

  it('places a new text element inside the embroidery area', () => {
    const element = buildTextElement(makeDocument([]), scope!.area, 'Chữ');
    expect(element.transform.x).toBe(scope!.area.boundXPx);
    expect(element.transform.y).toBe(scope!.area.boundYPx);
  });

  it('produces an id nothing in the document already uses', () => {
    const document = makeDocument([makeTextElement({ id: 'element-1' })]);
    expect(nextElementId(document)).not.toBe('element-1');
  });

  it('stops adding text at APP3-P01 own limit rather than a local one', () => {
    const many = makeDocument(
      Array.from({ length: DESIGN_DOCUMENT_LIMITS.maxTextElements }, (_unused, index) =>
        makeTextElement({ id: `element-${String(index)}` }),
      ),
    );
    expect(canAddTextElement(many)).toBe(false);
    expect(canAddTextElement(makeDocument([]))).toBe(true);
  });

  it('prunes a removed element from every group that named it', () => {
    const group = {
      id: 'group-1',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      transform: makeTextElement().transform,
      childIds: ['element-1', 'element-2'],
    } as never;
    const document = makeDocument([
      makeTextElement({ id: 'element-1' }),
      makeTextElement({ id: 'element-2' }),
      group,
    ]);
    expect(validateDesignDocumentStructure(document).ok).toBe(true);

    const pruned = removeElement(document, 'element-1');

    // A dangling child id makes the whole document unsaveable, through an edit
    // that looked purely local.
    expect(validateDesignDocumentStructure(pruned).ok).toBe(true);
    const remaining = pruned.elements.find((element) => element.id === 'group-1');
    expect(remaining).toMatchObject({ childIds: ['element-2'] });
  });
});

describe('failure classification', () => {
  it('does not answer a 409 on its own', () => {
    // Verified against the running API: both causes are raised as a NestJS
    // `ConflictException` and the envelope filter reduces every one of those to
    // `code: "CONFLICT"`. There is nothing on the wire to branch on, so the
    // classifier refuses to guess and says so in the type.
    expect(classifySaveFailure(apiError(409, 'CONFLICT'))).toBe('conflict-unresolved');
  });

  it('resolves the 409 from the template status the server reports', () => {
    expect(resolveConflictCause('DRAFT')).toBe('stale-version');
    expect(resolveConflictCause('PUBLISHED')).toBe('not-editable');
    expect(resolveConflictCause('ARCHIVED')).toBe('not-editable');
  });

  it('defaults to the recoverable branch when the re-read itself fails', () => {
    // The draft survives and the operator gets a choice. Defaulting the other
    // way would assert the template had left draft on no evidence, and that
    // copy invites a reload that discards their work.
    expect(resolveConflictCause(undefined)).toBe('stale-version');
  });

  it('reports a refused document as its own outcome', () => {
    expect(classifySaveFailure(apiError(422, 'DESIGN_TEMPLATE_DRAFT_INVALID'))).toBe(
      'document-rejected',
    );
  });

  it('treats a transport failure as generic', () => {
    const error = new TemplateEditorApiError(normalizeApiClientError(makeNetworkError()));
    expect(classifySaveFailure(error)).toBe('generic');
  });

  it('separates a missing template from any other read failure', () => {
    expect(classifyLoadFailure(apiError(404, 'DESIGN_TEMPLATE_NOT_FOUND'))).toBe('not-found');
    expect(classifyLoadFailure(apiError(500, 'INTERNAL'))).toBe('generic');
  });
});

describe('the reducer', () => {
  const base = () => initialEditorState(0, makeDocument([makeTextElement()]));

  it('starts clean, unconflicted and unselected', () => {
    const state = base();
    expect(saveChip(state)).toBe('saved');
    expect(canSave(state, true)).toBe(false);
  });

  it('marks the draft dirty on a text edit', () => {
    const state = editorReducer(base(), {
      type: 'UPDATE_TEXT',
      elementId: 'element-1',
      patch: { text: 'Mới' },
    });

    expect(state.dirty).toBe(true);
    expect(saveChip(state)).toBe('unsaved');
    expect(canSave(state, true)).toBe(true);
  });

  it('never mutates the baseline when the working copy is edited', () => {
    const start = base();
    const next = editorReducer(start, {
      type: 'UPDATE_TRANSFORM',
      elementId: 'element-1',
      patch: { x: 999 },
    });

    expect(next.baselineDocument).toBe(start.baselineDocument);
    expect(next.baselineDocument.elements[0]?.transform.x).toBe(120);
    expect(next.document.elements[0]?.transform.x).toBe(999);
  });

  it('refuses to save while clean, while saving and while conflicted', () => {
    const dirty = editorReducer(base(), {
      type: 'UPDATE_TEXT',
      elementId: 'element-1',
      patch: { text: 'x' },
    });

    expect(canSave(editorReducer(dirty, { type: 'MARK_SAVING' }), true)).toBe(false);
    expect(canSave(editorReducer(dirty, { type: 'STALE_CONFLICT' }), true)).toBe(false);
    // …and never when the template is not editable at all.
    expect(canSave(dirty, false)).toBe(false);
  });

  it('keeps the draft and the dirty flag through an ordinary save failure', () => {
    const dirty = editorReducer(base(), {
      type: 'UPDATE_TEXT',
      elementId: 'element-1',
      patch: { text: 'giữ lại' },
    });
    const failed = editorReducer(editorReducer(dirty, { type: 'MARK_SAVING' }), {
      type: 'SAVE_FAILURE',
      failure: 'generic',
    });

    expect(failed.saving).toBe(false);
    expect(failed.dirty).toBe(true);
    expect((failed.document.elements[0] as { text: string }).text).toBe('giữ lại');
  });

  it('holds the conflict open after the dialog is dismissed', () => {
    const conflicted = editorReducer(base(), { type: 'STALE_CONFLICT' });
    const kept = editorReducer(conflicted, { type: 'KEEP_LOCAL_DRAFT' });

    // Dismissing a dialog is a statement about a dialog. The draft is still
    // based on a stale version, so the chip must not read "saved".
    expect(kept.conflictDialogOpen).toBe(false);
    expect(kept.conflicted).toBe(true);
    expect(saveChip(kept)).toBe('conflict');
    expect(canSave(kept, true)).toBe(false);
  });

  it('leaves the baseline version untouched by a conflict', () => {
    const conflicted = editorReducer(initialEditorState(4, makeDocument()), {
      type: 'STALE_CONFLICT',
    });
    // The server wrote nothing, so nothing about the baseline changed.
    expect(conflicted.baselineVersion).toBe(4);
  });

  it('adopts the canonical document the server returned, not the one sent', () => {
    const dirty = editorReducer(base(), {
      type: 'UPDATE_TEXT',
      elementId: 'element-1',
      patch: { text: 'gửi đi' },
    });
    const canonical = makeDocument([makeTextElement({ text: 'đã chuẩn hoá' })]);

    const saved = editorReducer(dirty, { type: 'SAVE_SUCCESS', version: 1, document: canonical });

    expect(saved.document).toBe(canonical);
    expect(saved.baselineVersion).toBe(1);
    expect(saved.dirty).toBe(false);
    expect(saved.conflicted).toBe(false);
    expect(saveChip(saved)).toBe('saved');
  });

  it('drops a selection the replacement document no longer contains', () => {
    const selected = editorReducer(base(), { type: 'SELECT_ELEMENT', elementId: 'element-1' });
    const replaced = editorReducer(selected, {
      type: 'RESET_FROM_SERVER',
      version: 2,
      document: makeDocument([makeTextElement({ id: 'element-9' })]),
    });

    expect(replaced.selectedElementId).toBeNull();
  });

  it('clears the conflict and the draft when the server version is adopted', () => {
    const conflicted = editorReducer(base(), { type: 'STALE_CONFLICT' });
    const reloaded = editorReducer(conflicted, {
      type: 'RESET_FROM_SERVER',
      version: 7,
      document: makeDocument(),
    });

    expect(reloaded.conflicted).toBe(false);
    expect(reloaded.dirty).toBe(false);
    expect(reloaded.baselineVersion).toBe(7);
  });
});

describe('the editor source', () => {
  const ready = (detail: ReturnType<typeof makeUnversionedDetail>) =>
    resolveEditorSource({
      detail,
      detailLoading: false,
      detailFailure: null,
      placement: idlePlacement,
    });

  it('sends expectedCurrentVersion 0 for a template that was never saved', () => {
    const source = ready(makeUnversionedDetail());

    expect(source.kind).toBe('ready');
    if (source.kind !== 'ready') return;
    expect(source.version).toBe(UNVERSIONED_EXPECTED_VERSION);
    expect(source.version).toBe(0);
    // Not a fabricated 1. The server derives the first version.
    expect(source.document.elements).toEqual([]);
  });

  it('seeds the exact document a versioned template carries', () => {
    const document = makeDocument([makeTextElement({ text: 'từ máy chủ' })]);
    const source = ready(makeVersionedDetail(3, document));

    expect(source.kind).toBe('ready');
    if (source.kind !== 'ready') return;
    expect(source.version).toBe(3);
    expect((source.document.elements[0] as { text: string }).text).toBe('từ máy chủ');
  });

  it('reports a document this build cannot read instead of rendering it', () => {
    const source = ready(
      makeVersionedDetail(1, { schemaVersion: 99, placement: {}, elements: [] } as never),
    );
    expect(source.kind).toBe('document-invalid');
  });

  it('reports an unscoped template without ever asking for a Product', () => {
    const source = resolveEditorSource({
      detail: makeUnversionedDetail({ scope: undefined }),
      detailLoading: false,
      detailFailure: null,
      // A placement query that never ran: `isLoading` false, no data.
      placement: { placement: undefined, isLoading: false, failed: false, retry: () => undefined },
    });

    expect(source.kind).toBe('unscoped');
  });

  it('keeps an existing document when the scope no longer resolves', () => {
    const broken = makePlacement({ sides: [] });
    const source = resolveEditorSource({
      detail: makeVersionedDetail(2),
      detailLoading: false,
      detailFailure: null,
      placement: { placement: broken, isLoading: false, failed: false, retry: () => undefined },
    });

    // The draft survives; only the context is missing, and the screen says so.
    expect(source.kind).toBe('ready');
    if (source.kind !== 'ready') return;
    expect(source.scope).toBeNull();
  });

  it('cannot open an unsaved template whose scope no longer resolves', () => {
    const broken = makePlacement({ sides: [] });
    const source = resolveEditorSource({
      detail: makeUnversionedDetail(),
      detailLoading: false,
      detailFailure: null,
      placement: { placement: broken, isLoading: false, failed: false, retry: () => undefined },
    });

    // No version to read and no Side to build a placement from.
    expect(source.kind).toBe('scope-unresolved');
  });

  it('marks a non-DRAFT template as not editable', () => {
    for (const status of ['PUBLISHED', 'ARCHIVED']) {
      const source = ready(makeVersionedDetail(1, makeDocument(), { status }));
      expect(source.kind).toBe('ready');
      if (source.kind !== 'ready') continue;
      expect(source.editable).toBe(false);
    }
  });

  it('derives the reload document exactly as the first load did', () => {
    const detail = makeVersionedDetail(5);
    const first = ready(detail);
    const reloaded = rebuildDocument(detail, scope);

    expect(reloaded.kind).toBe('ok');
    if (reloaded.kind !== 'ok' || first.kind !== 'ready') return;
    expect(reloaded.version).toBe(first.version);
    expect(reloaded.document).toEqual(first.document);
  });
});
