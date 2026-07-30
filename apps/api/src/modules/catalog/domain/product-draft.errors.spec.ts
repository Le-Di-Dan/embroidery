/**
 * The safe error contract: exact statuses, and nothing internal in a message.
 */
import { HttpException } from '@nestjs/common';

import {
  isProductDraftError,
  PRODUCT_DRAFT_ERROR_CODES,
  productDraftError,
  toHttpException,
  type ProductDraftErrorCode,
} from './product-draft.errors';
import {
  isArchivableState,
  isEditableState,
  PRODUCT_ARCHIVED_STATE,
  PRODUCT_DRAFT_STATE,
} from './product-draft.policy';

const EXPECTED_STATUS: Record<ProductDraftErrorCode, number> = {
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_DRAFT_INVALID: 400,
  PRODUCT_NOT_EDITABLE: 409,
  PRODUCT_VERSION_CONFLICT: 409,
  PRODUCT_CATEGORY_INVALID: 400,
  PRODUCT_SLUG_CONFLICT: 409,
  PRODUCT_MEDIA_DUPLICATE: 400,
  PRODUCT_MEDIA_ASSET_NOT_FOUND: 400,
  PRODUCT_MEDIA_ASSET_UNAVAILABLE: 409,
  PRODUCT_ARCHIVE_NOT_ALLOWED: 409,
  PRODUCT_CURSOR_INVALID: 400,
};

describe('product draft error taxonomy', () => {
  it.each(PRODUCT_DRAFT_ERROR_CODES)('maps %s to its exact status', (code) => {
    const exception = toHttpException(productDraftError(code));
    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.getStatus()).toBe(EXPECTED_STATUS[code]);
    expect(exception.getResponse()).toMatchObject({ code });
    expect(typeof (exception.getResponse() as { message: unknown }).message).toBe('string');
  });

  it('leaks no SQL, constraint, table, actor or storage detail', () => {
    for (const code of PRODUCT_DRAFT_ERROR_CODES) {
      const message = productDraftError(code).message.toLowerCase();
      for (const forbidden of [
        // Trailing space: "selected" is ordinary operator-facing copy, while
        // "select " would be SQL.
        'select ',
        'update ',
        'constraint',
        'uq_products',
        'ck_products',
        'products.',
        'product_media',
        'categories',
        'pg',
        'sqlstate',
        'bucket',
        'storage',
        'checksum',
        'admin_account',
        'stack',
      ]) {
        expect({ code, forbidden, present: message.includes(forbidden) }).toEqual({
          code,
          forbidden,
          present: false,
        });
      }
    }
  });

  it('recognises only its own error type', () => {
    expect(isProductDraftError(productDraftError('PRODUCT_NOT_FOUND'))).toBe(true);
    expect(isProductDraftError(new Error('boom'))).toBe(false);
    expect(isProductDraftError(undefined)).toBe(false);
  });
});

describe('lifecycle predicates', () => {
  it('allows editing a DRAFT only', () => {
    expect(isEditableState(PRODUCT_DRAFT_STATE)).toBe(true);
    expect(isEditableState('PUBLISHED')).toBe(false);
    expect(isEditableState(PRODUCT_ARCHIVED_STATE)).toBe(false);
  });

  it('allows archiving a DRAFT only — unpublication belongs to B03', () => {
    expect(isArchivableState(PRODUCT_DRAFT_STATE)).toBe(true);
    expect(isArchivableState('PUBLISHED')).toBe(false);
    expect(isArchivableState(PRODUCT_ARCHIVED_STATE)).toBe(false);
  });
});
