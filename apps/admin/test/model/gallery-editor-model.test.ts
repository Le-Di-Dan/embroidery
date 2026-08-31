/**
 * The gallery editor's pure decisions (`APP11-A02`).
 *
 * Every rule under test here is one the server would otherwise enforce with a
 * refusal the operator has to read: what a create body may contain, which
 * fields a PATCH is allowed to carry, what "cleared" means as opposed to
 * "untouched", what position 0 means, and which four facts publication
 * actually requires. They are settled here because they are decidable without a
 * DOM, and because a component test that happened to exercise them would prove
 * the wiring rather than the rule.
 */
import {
  buildGalleryCreateBody,
  EMPTY_GALLERY_CREATE_VALUES,
  hasGalleryCreateErrors,
  isCanonicalGallerySlug,
  isGalleryCreateDirty,
  parseDisplayOrder,
  suggestGallerySlug,
  validateGalleryCreate,
} from '../../src/features/gallery-editor/model/gallery-create-values';
import {
  authoringValuesFromDetail,
  buildGalleryUpdateBody,
  isGalleryAuthoringDirty,
  validateGalleryAuthoring,
} from '../../src/features/gallery-editor/model/gallery-authoring-values';
import {
  addAssets,
  canMoveAsset,
  dedupeAssetIds,
  hasSelectionChanged,
  moveAsset,
  promoteAssetToCover,
  removeAsset,
  selectionFromDetailAssets,
} from '../../src/features/gallery-editor/model/gallery-media-selection';
import {
  evaluateGalleryReadiness,
  requirementsFromDetailCodes,
} from '../../src/features/gallery-editor/model/gallery-readiness';
import {
  flattenEligibleAssets,
  isAttachableGalleryAsset,
  isPreparableSourceAsset,
  resolveAssetCursor,
} from '../../src/features/gallery-editor/model/gallery-asset-lanes';
import { GALLERY_EDITOR_COPY } from '../../src/features/gallery-editor/model/gallery-editor-copy';
import { GALLERY_MEDIA_COPY } from '../../src/features/gallery-editor/model/gallery-media-copy';
import {
  classifyCreateFailure,
  classifyMediaSaveFailure,
  classifyPrepareFailure,
  classifyPublicationFailure,
  isVersionConflict,
  publicationRequirementCodes,
} from '../../src/features/gallery-editor/model/gallery-editor-failure';
import { GalleryEditorApiError } from '../../src/features/gallery-editor/model/gallery-editor-failure';
import { makeApiClientError } from '../support/api-error';
import {
  CATALOG_ASSET_ID,
  GALLERY_ASSET_ID,
  GALLERY_ASSET_ID_2,
  GALLERY_ASSET_ID_3,
  PRODUCT_ID,
  makeAsset,
  makeAssetPage,
  makeDetail,
  makeSourceAsset,
  withAssets,
} from '../support/gallery-editor-fixture';
import { normalizeApiClientError } from '@embroidery/api-client';

const CREATE_MESSAGES = GALLERY_EDITOR_COPY.create.validation;
const AUTHORING_MESSAGES = GALLERY_EDITOR_COPY.authoring.validation;

function asEditorError(options: Parameters<typeof makeApiClientError>[0]): unknown {
  return new GalleryEditorApiError(normalizeApiClientError(makeApiClientError(options)));
}

describe('the create body', () => {
  const valid = {
    title: 'Bộ sưu tập mùa hè',
    slug: 'bo-suu-tap-mua-he',
    description: 'Các mẫu thêu mùa hè.',
    displayOrder: '20',
    isIndexable: true,
  };

  it('carries exactly the five fields the contract requires', () => {
    expect(buildGalleryCreateBody(valid)).toEqual({
      title: 'Bộ sưu tập mùa hè',
      slug: 'bo-suu-tap-mua-he',
      description: 'Các mẫu thêu mùa hè.',
      displayOrder: 20,
      isIndexable: true,
    });
  });

  it('never carries a status, an asset list or an archive timestamp', () => {
    // Creation is always a DRAFT, media is a separate operation, and archival
    // is the server's to record. None of the three is expressible here.
    const body = buildGalleryCreateBody(valid) as unknown as Record<string, unknown>;
    for (const forbidden of ['status', 'assets', 'assetIds', 'archivedAt', 'altText']) {
      expect(body[forbidden]).toBeUndefined();
    }
  });

  it('refuses a slug that is not the canonical public grammar', () => {
    for (const slug of ['Bo-Suu-Tap', 'bo suu tap', 'bo--suu-tap', '-bo-suu-tap', 'bo-suu-tap-']) {
      expect(isCanonicalGallerySlug(slug)).toBe(false);
      const errors = validateGalleryCreate({ ...valid, slug }, CREATE_MESSAGES);
      expect(errors.slug).toBe(CREATE_MESSAGES.slugInvalid);
      expect(buildGalleryCreateBody({ ...valid, slug })).toBeNull();
    }
  });

  it('distinguishes an absent slug from an invalid one', () => {
    expect(validateGalleryCreate({ ...valid, slug: '  ' }, CREATE_MESSAGES).slug).toBe(
      CREATE_MESSAGES.slugRequired,
    );
  });

  it('requires a description, because an entry without one can never publish', () => {
    const errors = validateGalleryCreate({ ...valid, description: '  ' }, CREATE_MESSAGES);
    expect(errors.description).toBe(CREATE_MESSAGES.descriptionRequired);
    expect(hasGalleryCreateErrors(errors)).toBe(true);
  });

  it('accepts only a non-negative integer display order, exactly as typed', () => {
    expect(parseDisplayOrder('0')).toBe(0);
    expect(parseDisplayOrder(' 42 ')).toBe(42);
    // Each of these would be silently coerced by `Number` into a value the
    // operator did not type.
    for (const raw of ['1e3', '0x10', '1.0', '-1', '', 'abc', '2147483648']) {
      expect(parseDisplayOrder(raw)).toBeNull();
    }
  });

  it('suggests a slug without ever applying one silently', () => {
    expect(suggestGallerySlug('Áo thun thêu hoa sen')).toBe('ao-thun-theu-hoa-sen');
    expect(suggestGallerySlug('Đồ chơi & Quà tặng!!')).toBe('do-choi-qua-tang');
    // The suggestion is only ever a value the operator can then edit: the empty
    // form is not dirty, and nothing here writes into the body.
    expect(isGalleryCreateDirty(EMPTY_GALLERY_CREATE_VALUES)).toBe(false);
    expect(buildGalleryCreateBody(EMPTY_GALLERY_CREATE_VALUES)).toBeNull();
  });

  it('carries isIndexable as the operator set it, in both directions', () => {
    expect(buildGalleryCreateBody({ ...valid, isIndexable: false })).toMatchObject({
      isIndexable: false,
    });
  });
});

describe('the authoring PATCH body', () => {
  const entry = makeDetail({
    linkedProductId: PRODUCT_ID,
    seoTitle: 'Tiêu đề cũ',
    seoDescription: 'Mô tả cũ',
  });
  const initial = authoringValuesFromDetail(entry);

  it('is null when nothing changed, so no request is made', () => {
    expect(buildGalleryUpdateBody(initial, initial)).toBeNull();
    expect(isGalleryAuthoringDirty(initial, initial)).toBe(false);
  });

  it('carries only the fields that actually changed', () => {
    const body = buildGalleryUpdateBody(initial, { ...initial, title: 'Tên mới' });
    expect(body).toEqual({ title: 'Tên mới' });
  });

  it('never carries slug, status, assets or archivedAt', () => {
    const body = buildGalleryUpdateBody(initial, {
      ...initial,
      title: 'Tên mới',
      description: 'Mô tả mới',
      displayOrder: '99',
      isIndexable: false,
    }) as Record<string, unknown>;
    for (const forbidden of ['slug', 'status', 'assets', 'assetIds', 'archivedAt', 'altText']) {
      expect(body[forbidden]).toBeUndefined();
    }
    // And it does carry every field that is editable.
    expect(body).toEqual({
      title: 'Tên mới',
      description: 'Mô tả mới',
      displayOrder: 99,
      isIndexable: false,
    });
  });

  it('sends null to clear a nullable field, and omits it when untouched', () => {
    expect(buildGalleryUpdateBody(initial, { ...initial, linkedProductId: '' })).toEqual({
      linkedProductId: null,
    });
    expect(buildGalleryUpdateBody(initial, { ...initial, seoTitle: '' })).toEqual({
      seoTitle: null,
    });
    // Untouched: absent from the body, so a concurrent change to it survives.
    const body = buildGalleryUpdateBody(initial, { ...initial, title: 'Tên mới' }) as Record<
      string,
      unknown
    >;
    expect('seoTitle' in body).toBe(false);
    expect('linkedProductId' in body).toBe(false);
  });

  it('sets an empty description rather than clearing it to null', () => {
    // The column is NOT NULL, so "no description" is the empty string.
    expect(buildGalleryUpdateBody(initial, { ...initial, description: '' })).toEqual({
      description: '',
    });
  });

  it('treats a whitespace-only edit as no change at all', () => {
    expect(
      buildGalleryUpdateBody(initial, { ...initial, title: `  ${initial.title}  ` }),
    ).toBeNull();
  });

  it('refuses an empty title but accepts an empty description', () => {
    expect(validateGalleryAuthoring({ ...initial, title: ' ' }, AUTHORING_MESSAGES).title).toBe(
      AUTHORING_MESSAGES.titleRequired,
    );
    // Publication reports a missing description; the save does not refuse it,
    // so an operator who cleared it mid-edit can still persist the rest.
    expect(validateGalleryAuthoring({ ...initial, description: '' }, AUTHORING_MESSAGES)).toEqual(
      {},
    );
  });

  it('carries no concurrency token, because the operation accepts none', () => {
    const body = buildGalleryUpdateBody(initial, { ...initial, title: 'Tên mới' }) as Record<
      string,
      unknown
    >;
    expect(body['expectedUpdatedAt']).toBeUndefined();
  });
});

describe('the ordered image selection', () => {
  const three = [GALLERY_ASSET_ID, GALLERY_ASSET_ID_2, GALLERY_ASSET_ID_3];

  it('reads the persisted order from position, not from array order', () => {
    const entry = makeDetail({
      assets: [
        { assetId: GALLERY_ASSET_ID_2, position: 1 },
        { assetId: GALLERY_ASSET_ID, position: 0 },
      ],
      assetCount: 2,
    });
    expect(selectionFromDetailAssets(entry.assets)).toEqual([GALLERY_ASSET_ID, GALLERY_ASSET_ID_2]);
  });

  it('never holds a duplicate the contract would refuse', () => {
    expect(dedupeAssetIds([GALLERY_ASSET_ID, GALLERY_ASSET_ID])).toEqual([GALLERY_ASSET_ID]);
    expect(addAssets(three, [GALLERY_ASSET_ID])).toEqual(three);
  });

  it('moves an entry and refuses a move that would go nowhere', () => {
    expect(moveAsset(three, 0, 1)).toEqual([
      GALLERY_ASSET_ID_2,
      GALLERY_ASSET_ID,
      GALLERY_ASSET_ID_3,
    ]);
    expect(moveAsset(three, 0, -1)).toEqual(three);
    expect(moveAsset(three, 2, 1)).toEqual(three);
    expect(canMoveAsset(three, 0, -1)).toBe(false);
    expect(canMoveAsset(three, 2, 1)).toBe(false);
    expect(canMoveAsset(three, 1, -1)).toBe(true);
  });

  it('makes "set as cover" a move to position 0 and nothing else', () => {
    expect(promoteAssetToCover(three, 2)).toEqual([
      GALLERY_ASSET_ID_3,
      GALLERY_ASSET_ID,
      GALLERY_ASSET_ID_2,
    ]);
    // No flag anywhere: the selection is still just ordered ids.
    expect(promoteAssetToCover(three, 0)).toEqual(three);
  });

  it('detaches without touching anything else', () => {
    expect(removeAsset(three, GALLERY_ASSET_ID_2)).toEqual([GALLERY_ASSET_ID, GALLERY_ASSET_ID_3]);
    expect(removeAsset(three, 'unknown')).toEqual(three);
  });

  it('reports a reorder as a change, not only a membership difference', () => {
    expect(hasSelectionChanged(three, three)).toBe(false);
    expect(hasSelectionChanged(three, [...three].reverse())).toBe(true);
    expect(hasSelectionChanged(three, three.slice(0, 2))).toBe(true);
    // An empty selection is a legal state and a real change.
    expect(hasSelectionChanged(three, [])).toBe(true);
    expect(hasSelectionChanged([], [])).toBe(false);
  });
});

describe('publication readiness', () => {
  it('is exactly title, slug, description and one persisted image', () => {
    expect(evaluateGalleryReadiness(withAssets([GALLERY_ASSET_ID]))).toEqual({
      ready: true,
      unsatisfied: [],
    });
    expect(evaluateGalleryReadiness(makeDetail()).unsatisfied).toEqual(['asset']);
    expect(
      evaluateGalleryReadiness(withAssets([GALLERY_ASSET_ID], { description: '  ' })).unsatisfied,
    ).toEqual(['description']);
    expect(
      evaluateGalleryReadiness(withAssets([GALLERY_ASSET_ID], { title: '' })).unsatisfied,
    ).toEqual(['title']);
  });

  it('requires no linked product, no SEO text and no indexability', () => {
    // A `noindex` entry with no product and no SEO text is publishable — the
    // server says so, and this panel must not disagree.
    const entry = withAssets([GALLERY_ASSET_ID], { isIndexable: false });
    expect(evaluateGalleryReadiness(entry).ready).toBe(true);
  });

  it('counts persisted associations, never a local arrangement', () => {
    // The entry has no `assets`, so it is not ready however many images the
    // operator has staged on screen.
    expect(evaluateGalleryReadiness(makeDetail()).ready).toBe(false);
  });

  it('maps the server requirement codes and drops anything it does not know', () => {
    expect(
      requirementsFromDetailCodes([
        'GALLERY_ENTRY_TITLE_REQUIRED',
        'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED',
        'SOMETHING_THIS_BUILD_HAS_NEVER_HEARD_OF',
      ]),
    ).toEqual(['title', 'asset']);
  });
});

describe('the two asset lanes', () => {
  it('accepts only a prepared public image for attachment', () => {
    expect(isAttachableGalleryAsset(makeAsset())).toBe(true);
    expect(isAttachableGalleryAsset(makeSourceAsset())).toBe(false);
    expect(isAttachableGalleryAsset(makeAsset({ status: 'INSPECTING' }))).toBe(false);
    expect(isAttachableGalleryAsset(makeAsset({ classification: 'PRODUCTION_SENSITIVE' }))).toBe(
      false,
    );
  });

  it('accepts only an accepted catalog image as a preparation source', () => {
    expect(isPreparableSourceAsset(makeSourceAsset())).toBe(true);
    expect(isPreparableSourceAsset(makeAsset())).toBe(false);
    expect(isPreparableSourceAsset(makeSourceAsset({ status: 'REJECTED' }))).toBe(false);
  });

  it('flattens pages in server order, first occurrence winning', () => {
    const pages = [
      makeAssetPage([makeAsset(), makeAsset({ assetId: GALLERY_ASSET_ID_2 })], { next: 'c1' }),
      // A concurrent preparation shifted the window and repeated one row.
      makeAssetPage([makeAsset({ assetId: GALLERY_ASSET_ID_2 }), makeSourceAsset()]),
    ];
    expect(flattenEligibleAssets(pages, 'GALLERY').map((a) => a.assetId)).toEqual([
      GALLERY_ASSET_ID,
      GALLERY_ASSET_ID_2,
    ]);
    // The same pages read as the catalog lane yield only the source.
    expect(flattenEligibleAssets(pages, 'CATALOG').map((a) => a.assetId)).toEqual([
      CATALOG_ASSET_ID,
    ]);
  });

  it('treats hasNext without a cursor as no continuation', () => {
    expect(resolveAssetCursor(makeAssetPage([], { next: 'c1' }))).toBe('c1');
    expect(resolveAssetCursor(makeAssetPage([]))).toBeUndefined();
    expect(resolveAssetCursor({ items: [], hasNext: true })).toBeUndefined();
    expect(resolveAssetCursor(undefined)).toBeUndefined();
  });
});

describe('failure classification', () => {
  it('treats only the exact domain code as a version conflict', () => {
    expect(
      isVersionConflict(asEditorError({ status: 409, code: 'GALLERY_ENTRY_VERSION_CONFLICT' })),
    ).toBe(true);
    // Four different things answer 409, and reloading repairs only one of them.
    for (const code of [
      'GALLERY_ENTRY_SLUG_CONFLICT',
      'GALLERY_ENTRY_PUBLICATION_NOT_READY',
      'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED',
      'GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED',
    ]) {
      expect(isVersionConflict(asEditorError({ status: 409, code }))).toBe(false);
    }
  });

  it('names a taken address as a slug conflict and nothing else', () => {
    expect(
      classifyCreateFailure(asEditorError({ status: 409, code: 'GALLERY_ENTRY_SLUG_CONFLICT' })),
    ).toBe('slugConflict');
    expect(classifyCreateFailure(asEditorError({ status: 401, code: 'UNAUTHORIZED' }))).toBe(
      'unauthenticated',
    );
    expect(classifyCreateFailure(asEditorError({ status: 500, code: 'INTERNAL' }))).toBe('generic');
  });

  it('separates an ineligible image from a duplicate one', () => {
    expect(
      classifyMediaSaveFailure(
        asEditorError({ status: 400, code: 'GALLERY_ENTRY_ASSET_NOT_ELIGIBLE' }),
      ),
    ).toBe('notEligible');
    expect(
      classifyMediaSaveFailure(
        asEditorError({ status: 400, code: 'GALLERY_ENTRY_ASSET_DUPLICATE' }),
      ),
    ).toBe('duplicate');
  });

  it('separates not-ready from a forbidden transition', () => {
    expect(
      classifyPublicationFailure(
        asEditorError({ status: 409, code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY' }),
      ),
    ).toBe('notReady');
    expect(
      classifyPublicationFailure(
        asEditorError({ status: 409, code: 'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED' }),
      ),
    ).toBe('notAllowed');
  });

  it('reads requirement codes only from a not-ready refusal', () => {
    const notReady = asEditorError({
      status: 409,
      code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY',
      errors: [
        {
          field: 'requirements',
          code: 'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED',
          message: 'not ready',
        },
      ],
    });
    expect(publicationRequirementCodes(notReady)).toEqual([
      'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED',
    ]);
    // A conflict carries no requirements, whatever else its envelope holds.
    expect(
      publicationRequirementCodes(
        asEditorError({ status: 409, code: 'GALLERY_ENTRY_VERSION_CONFLICT' }),
      ),
    ).toEqual([]);
  });

  it('names a stale preparation source, and collapses every eligibility miss', () => {
    expect(
      classifyPrepareFailure(
        asEditorError({ status: 409, code: 'GALLERY_ASSET_SOURCE_VERSION_CONFLICT' }),
      ),
    ).toBe('staleSource');
    // An unknown id, a private upload and an unready rendition are one answer.
    expect(
      classifyPrepareFailure(
        asEditorError({ status: 404, code: 'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE' }),
      ),
    ).toBe('notEligible');
    expect(
      classifyPrepareFailure(asEditorError({ status: 503, code: 'INTERNAL_SERVER_ERROR' })),
    ).toBe('unavailable');
  });
});

describe('the operator-facing vocabulary', () => {
  // Both catalogs as one string, so a leak anywhere in either is one match.
  const catalogs = JSON.stringify([GALLERY_EDITOR_COPY, GALLERY_MEDIA_COPY]);

  it('carries no engineering commentary an operator cannot act on', () => {
    for (const leak of [
      'APP11',
      'expectedUpdatedAt',
      'assetIds',
      'display_order',
      'GALLERY_ENTRY_',
      '/api/admin',
      'DTO',
      'endpoint',
      'checkpoint',
      'PRODUCTION_SENSITIVE',
      'GALLERY_MEDIA',
    ]) {
      expect(catalogs).not.toContain(leak);
    }
  });

  it('offers no alt-text label anywhere, because there is no field to fill', () => {
    expect(catalogs.toLowerCase()).not.toContain('alt text');
    expect(catalogs).not.toContain('altText');
  });
});
