/**
 * The category model: the editability matrix, the wire bodies, the validation
 * and the failure classification (`APP12-A01`).
 *
 * These are the rules a rendered test cannot settle cheaply — that a published
 * slug never reaches the wire, that an unchanged form produces no patch, that
 * `expectedUpdatedAt` is the server's token rather than a fabricated one, and
 * that a `409` alone is never read as a version conflict.
 */
import {
  classifyCategoryFailure,
  isCategoryVersionConflict,
  isSlugFieldFailure,
} from '../../src/features/categories/model/category-conflict';
import { CategoryApiError } from '../../src/features/categories/model/category-failure';
import {
  canArchiveCategory,
  canPublishCategory,
  isCategoryAssignable,
  isCategoryFieldEditable,
  isCategoryReadOnly,
  isCategorySlugLocked,
} from '../../src/features/categories/model/category-editability';
import {
  isCategoryFormDirty,
  isEmptyCategoryPatch,
  toCategoryFormValues,
  toCreateCategoryBody,
  toUpdateCategoryBody,
  validateCategoryForm,
  type CategoryBaseline,
} from '../../src/features/categories/model/category-form-values';
import { presentCategoryStatus } from '../../src/features/categories/model/category-status';

const BASELINE: CategoryBaseline = {
  name: 'Áo thun',
  slug: 'ao-thun',
  isIndexable: true,
  displayOrder: 10,
  updatedAt: '2026-09-03T04:05:06Z',
};

function apiError(code: string | undefined, httpStatus: number): CategoryApiError {
  return new CategoryApiError({
    code,
    httpStatus,
    message: 'server prose that must never reach the screen',
  } as never);
}

describe('category editability matrix', () => {
  it('allows every field on a DRAFT', () => {
    for (const field of ['name', 'slug', 'isIndexable', 'displayOrder'] as const) {
      expect(isCategoryFieldEditable('DRAFT', field)).toBe(true);
    }
    expect(isCategorySlugLocked('DRAFT')).toBe(false);
    expect(isCategoryReadOnly('DRAFT')).toBe(false);
  });

  it('freezes only the slug once PUBLISHED', () => {
    expect(isCategoryFieldEditable('PUBLISHED', 'slug')).toBe(false);
    expect(isCategorySlugLocked('PUBLISHED')).toBe(true);
    for (const field of ['name', 'isIndexable', 'displayOrder'] as const) {
      expect(isCategoryFieldEditable('PUBLISHED', field)).toBe(true);
    }
    expect(isCategoryReadOnly('PUBLISHED')).toBe(false);
  });

  it('makes an ARCHIVED category read-only outright', () => {
    expect(isCategoryReadOnly('ARCHIVED')).toBe(true);
    for (const field of ['name', 'slug', 'isIndexable', 'displayOrder'] as const) {
      expect(isCategoryFieldEditable('ARCHIVED', field)).toBe(false);
    }
  });

  it('closes by default: an unknown state edits nothing and offers nothing', () => {
    expect(isCategoryReadOnly('SCHEDULED')).toBe(true);
    expect(canPublishCategory('SCHEDULED')).toBe(false);
    expect(canArchiveCategory('SCHEDULED')).toBe(false);
    expect(isCategoryAssignable('SCHEDULED')).toBe(false);
  });

  it('offers exactly the two transitions the contract allows', () => {
    expect(canPublishCategory('DRAFT')).toBe(true);
    expect(canPublishCategory('ARCHIVED')).toBe(false);
    expect(canArchiveCategory('PUBLISHED')).toBe(true);
    // DRAFT -> ARCHIVED and ARCHIVED -> PUBLISHED are refused by the contract,
    // so neither is ever offered.
    expect(canArchiveCategory('DRAFT')).toBe(false);
    expect(canPublishCategory('PUBLISHED')).toBe(false);
  });

  it('makes only a PUBLISHED category assignable to a product', () => {
    expect(isCategoryAssignable('PUBLISHED')).toBe(true);
    expect(isCategoryAssignable('DRAFT')).toBe(false);
    expect(isCategoryAssignable('ARCHIVED')).toBe(false);
  });
});

describe('create body', () => {
  it('carries exactly the four contract fields and no status', () => {
    const body = toCreateCategoryBody({
      name: '  Quà tặng doanh nghiệp  ',
      slug: 'qua-tang-doanh-nghiep',
      isIndexable: true,
      displayOrder: '30',
    });
    expect(body).toEqual({
      name: 'Quà tặng doanh nghiệp',
      slug: 'qua-tang-doanh-nghiep',
      isIndexable: true,
      displayOrder: 30,
    });
    expect(Object.keys(body)).toHaveLength(4);
    expect(body).not.toHaveProperty('status');
  });

  it('does not derive the slug from the name', () => {
    const body = toCreateCategoryBody({
      name: 'Quà tặng doanh nghiệp',
      slug: 'khac-hoan-toan',
      isIndexable: false,
      displayOrder: '0',
    });
    expect(body.slug).toBe('khac-hoan-toan');
  });
});

describe('update body', () => {
  it('sends only what changed, plus the server token verbatim', () => {
    const values = { ...toCategoryFormValues(BASELINE), name: 'Áo phông' };
    const body = toUpdateCategoryBody(values, BASELINE, { editableSlug: true });
    expect(body).toEqual({ expectedUpdatedAt: BASELINE.updatedAt, name: 'Áo phông' });
  });

  it('never sends the slug for a published category, even when it differs', () => {
    const values = { ...toCategoryFormValues(BASELINE), slug: 'ao-phong' };
    const body = toUpdateCategoryBody(values, BASELINE, { editableSlug: false });
    expect(body).not.toHaveProperty('slug');
    expect(isEmptyCategoryPatch(body)).toBe(true);
  });

  it('does not resend an unchanged slug for a draft', () => {
    const body = toUpdateCategoryBody(toCategoryFormValues(BASELINE), BASELINE, {
      editableSlug: true,
    });
    expect(body).not.toHaveProperty('slug');
    expect(isEmptyCategoryPatch(body)).toBe(true);
  });

  it('recognises an untouched form as clean and a changed one as dirty', () => {
    expect(isCategoryFormDirty(toCategoryFormValues(BASELINE), BASELINE)).toBe(false);
    expect(
      isCategoryFormDirty({ ...toCategoryFormValues(BASELINE), displayOrder: '11' }, BASELINE),
    ).toBe(true);
  });
});

describe('validation', () => {
  const valid = { name: 'Khăn', slug: 'khan', isIndexable: false, displayOrder: '0' };

  it('accepts a well-formed draft', () => {
    expect(validateCategoryForm(valid, { editableSlug: true })).toEqual({});
  });

  it('rejects a malformed slug by shape rather than by membership', () => {
    for (const slug of ['Khan', 'khan_', '-khan', 'khan--x', 'khăn', 'khan ']) {
      expect(validateCategoryForm({ ...valid, slug }, { editableSlug: true }).slug).toBe(
        'slug-malformed',
      );
    }
  });

  it('does not validate a slug it will not send', () => {
    expect(
      validateCategoryForm({ ...valid, slug: 'NOT A SLUG' }, { editableSlug: false }).slug,
    ).toBeUndefined();
  });

  it('rejects a display order that merely coerces to a number', () => {
    for (const displayOrder of ['1e3', '1.5', '-1', '', 'x']) {
      expect(
        validateCategoryForm({ ...valid, displayOrder }, { editableSlug: true }).displayOrder,
      ).toBeDefined();
    }
    expect(
      validateCategoryForm({ ...valid, displayOrder: '100001' }, { editableSlug: true })
        .displayOrder,
    ).toBe('display-order-range');
  });

  it('requires a non-blank name', () => {
    expect(validateCategoryForm({ ...valid, name: '   ' }, { editableSlug: true }).name).toBe(
      'name-required',
    );
  });
});

describe('failure classification', () => {
  it('maps every C02 domain code', () => {
    const cases = {
      CATEGORY_NOT_FOUND: 'not-found',
      CATEGORY_SLUG_CONFLICT: 'slug-conflict',
      CATEGORY_SLUG_IMMUTABLE: 'slug-immutable',
      CATEGORY_INVALID_TRANSITION: 'invalid-transition',
      CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS: 'archive-blocked',
      CATEGORY_VERSION_CONFLICT: 'version-conflict',
      CATEGORY_INVENTORY_TOO_LARGE: 'inventory-too-large',
    } as const;
    for (const [code, expected] of Object.entries(cases)) {
      expect(classifyCategoryFailure(apiError(code, 409))).toBe(expected);
    }
  });

  it('never reads a bare 409 as a version conflict', () => {
    expect(isCategoryVersionConflict(apiError(undefined, 409))).toBe(false);
    expect(isCategoryVersionConflict(apiError('CATEGORY_SLUG_CONFLICT', 409))).toBe(false);
    expect(isCategoryVersionConflict(apiError('CATEGORY_VERSION_CONFLICT', 409))).toBe(true);
  });

  it('routes both slug refusals to the field, and nothing else', () => {
    expect(isSlugFieldFailure('slug-conflict')).toBe(true);
    expect(isSlugFieldFailure('slug-immutable')).toBe(true);
    expect(isSlugFieldFailure('version-conflict')).toBe(false);
    expect(isSlugFieldFailure('archive-blocked')).toBe(false);
  });

  it('degrades an unknown failure to generic rather than guessing', () => {
    expect(classifyCategoryFailure(new Error('boom'))).toBe('generic');
    expect(classifyCategoryFailure(apiError('SOMETHING_NEW', 500))).toBe('generic');
    expect(classifyCategoryFailure(apiError(undefined, 404))).toBe('not-found');
  });
});

describe('status presentation', () => {
  it('names the three states with a symbol as well as a tone', () => {
    expect(presentCategoryStatus('DRAFT')).toMatchObject({ label: 'Nháp', known: true });
    expect(presentCategoryStatus('PUBLISHED')).toMatchObject({
      label: 'Đang hiển thị',
      tone: 'success',
      known: true,
    });
    expect(presentCategoryStatus('ARCHIVED')).toMatchObject({
      label: 'Đã lưu trữ',
      tone: 'muted',
      known: true,
    });
    for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED']) {
      expect(presentCategoryStatus(status).symbol).not.toBe('');
    }
  });

  it('degrades an unknown state instead of printing an English enum member', () => {
    const unknown = presentCategoryStatus('SCHEDULED');
    expect(unknown.known).toBe(false);
    expect(unknown.label).toBe('Không xác định');
    expect(unknown.token).toBe('UNKNOWN');
  });
});
