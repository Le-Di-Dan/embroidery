/**
 * @jest-environment node
 *
 * The publication view model and failure classification.
 *
 * These are the rules a rendering test cannot pin precisely: which pairs of
 * server answers may authorise a command, what the seven requirement rows look
 * like, and which domain code maps to which recovery.
 */
import { AdminProductRequirementResponseCode } from '@embroidery/api-client';

import {
  canPublish,
  canUnpublish,
  toCoherentSnapshot,
  toRequirementRows,
} from '../../src/features/products/model/product-publication';
import {
  classifyPublicationFailure,
  isPublicationVersionConflict,
  unmetRequirementCodesFrom,
} from '../../src/features/products/model/product-publication-failure';
import { PRODUCT_REQUIREMENT_LABEL } from '../../src/features/products/model/product-publication-copy';
import { adminProductPublicationRoute } from '../../src/features/products/model/product-route';
import { productQueryKeys } from '../../src/features/products/model/product-query-keys';
import { ProductApiError } from '../../src/features/products/model/product-failure';
import { makeProductDetail, makeReadiness, REQUIREMENT_CODES } from '../support/product-fixture';

function apiError(code: string, fieldErrors?: { field: string; code: string; message: string }[]) {
  return new ProductApiError({
    code,
    message: 'irrelevant server prose',
    httpStatus: 409,
    ...(fieldErrors === undefined ? {} : { fieldErrors }),
  });
}

describe('requirement rows', () => {
  it('renders every contract code, in the server order', () => {
    const rows = toRequirementRows(makeReadiness().requirements);

    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.code)).toEqual([...REQUIREMENT_CODES]);
  });

  it('has approved copy for every code in the contract', () => {
    for (const code of REQUIREMENT_CODES) {
      expect(PRODUCT_REQUIREMENT_LABEL[code]).toEqual(expect.any(String));
      expect(PRODUCT_REQUIREMENT_LABEL[code].length).toBeGreaterThan(0);
    }
  });

  it('never derives prose from the code string', () => {
    for (const code of REQUIREMENT_CODES) {
      expect(PRODUCT_REQUIREMENT_LABEL[code]).not.toContain('PRODUCT_');
      expect(PRODUCT_REQUIREMENT_LABEL[code]).not.toContain('_');
    }
  });

  it('preserves the server order even when it is not the contract order', () => {
    const reversed = [...REQUIREMENT_CODES].reverse().map((code) => ({ code, satisfied: true }));
    const rows = toRequirementRows(reversed);

    expect(rows.map((row) => row.code)).toEqual([...REQUIREMENT_CODES].reverse());
  });

  it('renders an unknown code visibly and never as satisfied', () => {
    const rows = toRequirementRows([{ code: 'PRODUCT_SOMETHING_NEW', satisfied: true }] as never);

    expect(rows[0]?.unknown).toBe(true);
    expect(rows[0]?.satisfied).toBe(false);
    expect(rows[0]?.label).not.toContain('PRODUCT_SOMETHING_NEW');
    expect(rows[0]?.label.length).toBeGreaterThan(0);
  });
});

describe('coherent snapshot', () => {
  const detail = makeProductDetail();

  it('builds a snapshot when status and token agree', () => {
    const snapshot = toCoherentSnapshot(detail, makeReadiness());

    expect(snapshot).not.toBeNull();
    expect(snapshot?.expectedUpdatedAt).toBe(detail.updatedAt);
    expect(snapshot?.status).toBe('DRAFT');
  });

  it('refuses a pair whose tokens disagree, even at the same status', () => {
    const snapshot = toCoherentSnapshot(
      detail,
      makeReadiness({ updatedAt: '2026-07-28T09:59:00.000Z' }),
    );

    expect(snapshot).toBeNull();
  });

  it('refuses a pair whose statuses disagree, even at the same token', () => {
    const snapshot = toCoherentSnapshot(detail, makeReadiness({ status: 'PUBLISHED' }));

    expect(snapshot).toBeNull();
  });

  it('takes the command token from the snapshot, not from the detail record alone', () => {
    const snapshot = toCoherentSnapshot(detail, makeReadiness());

    expect(snapshot?.expectedUpdatedAt).toBe(makeReadiness().updatedAt);
  });
});

describe('lifecycle gating', () => {
  it('allows publish only for an eligible DRAFT', () => {
    const snapshot = toCoherentSnapshot(makeProductDetail(), makeReadiness());

    expect(canPublish(snapshot!)).toBe(true);
  });

  it('refuses publish for a DRAFT that is not eligible', () => {
    const snapshot = toCoherentSnapshot(
      makeProductDetail(),
      makeReadiness({ unsatisfied: ['PRODUCT_PRICE_READY'] }),
    );

    expect(canPublish(snapshot!)).toBe(false);
  });

  it('refuses publish for an eligible non-DRAFT', () => {
    const snapshot = toCoherentSnapshot(
      makeProductDetail({ status: 'PUBLISHED' }),
      makeReadiness({ status: 'PUBLISHED' }),
    );

    expect(snapshot?.eligible).toBe(true);
    expect(canPublish(snapshot!)).toBe(false);
  });

  it('allows unpublish for a PUBLISHED product whose requirements no longer hold', () => {
    const snapshot = toCoherentSnapshot(
      makeProductDetail({ status: 'PUBLISHED' }),
      makeReadiness({
        status: 'PUBLISHED',
        unsatisfied: ['PRODUCT_CATEGORY_READY', 'PRODUCT_PRICE_READY'],
      }),
    );

    expect(snapshot?.eligible).toBe(false);
    expect(canUnpublish(snapshot!)).toBe(true);
  });

  it('offers neither command for an archived product', () => {
    const snapshot = toCoherentSnapshot(
      makeProductDetail({ status: 'ARCHIVED' }),
      makeReadiness({ status: 'ARCHIVED' }),
    );

    expect(canPublish(snapshot!)).toBe(false);
    expect(canUnpublish(snapshot!)).toBe(false);
  });
});

describe('failure classification', () => {
  it('classifies each publication code exactly', () => {
    expect(classifyPublicationFailure(apiError('PRODUCT_VERSION_CONFLICT'))).toBe(
      'version-conflict',
    );
    expect(classifyPublicationFailure(apiError('PRODUCT_PUBLICATION_NOT_READY'))).toBe('not-ready');
    expect(classifyPublicationFailure(apiError('PRODUCT_PUBLISH_NOT_ALLOWED'))).toBe(
      'publish-not-allowed',
    );
    expect(classifyPublicationFailure(apiError('PRODUCT_UNPUBLISH_NOT_ALLOWED'))).toBe(
      'unpublish-not-allowed',
    );
  });

  it('treats an unknown 409 as generic rather than guessing', () => {
    expect(classifyPublicationFailure(apiError('PRODUCT_SOMETHING_ELSE'))).toBe('generic');
    expect(classifyPublicationFailure(new Error('boom'))).toBe('generic');
  });

  it('opens the reload dialog for the version conflict alone', () => {
    expect(isPublicationVersionConflict(apiError('PRODUCT_VERSION_CONFLICT'))).toBe(true);
    for (const code of [
      'PRODUCT_PUBLICATION_NOT_READY',
      'PRODUCT_PUBLISH_NOT_ALLOWED',
      'PRODUCT_UNPUBLISH_NOT_ALLOWED',
      'PRODUCT_NOT_EDITABLE',
    ]) {
      expect(isPublicationVersionConflict(apiError(code))).toBe(false);
    }
  });

  it('reads only known requirement codes out of a not-ready refusal', () => {
    const codes = unmetRequirementCodesFrom(
      apiError('PRODUCT_PUBLICATION_NOT_READY', [
        { field: 'requirements', code: 'PRODUCT_INVENTED_CODE', message: 'x' },
        { field: 'requirements', code: 'PRODUCT_PRICE_READY', message: 'x' },
        { field: 'requirements', code: 'PRODUCT_DESCRIPTION_READY', message: 'x' },
      ]),
    );

    expect(codes).toEqual([
      AdminProductRequirementResponseCode.PRODUCT_DESCRIPTION_READY,
      AdminProductRequirementResponseCode.PRODUCT_PRICE_READY,
    ]);
  });

  it('returns nothing when a refusal carries no structured detail', () => {
    expect(unmetRequirementCodesFrom(apiError('PRODUCT_PUBLICATION_NOT_READY'))).toEqual([]);
  });
});

describe('route and cache keys', () => {
  it('nests publication under the product UUID', () => {
    expect(adminProductPublicationRoute('01920000-0000-7000-8000-000000000001')).toBe(
      '/products/01920000-0000-7000-8000-000000000001/publication',
    );
  });

  it('uses no /catalog, /publish or Vietnamese alias', () => {
    const route = adminProductPublicationRoute('p-1');
    expect(route.startsWith('/products/')).toBe(true);
    expect(route).not.toContain('/catalog');
    expect(route).not.toContain('/san-pham');
    expect(route).not.toContain('/admin/');
  });

  it('keys readiness separately from the detail record', () => {
    expect(productQueryKeys.publicationReadiness('p-1')).not.toEqual(
      productQueryKeys.detail('p-1'),
    );
    expect(productQueryKeys.publicationReadiness('p-1')).toContain('p-1');
  });

  it('carries no token, form value or credential in the readiness key', () => {
    const key = JSON.stringify(productQueryKeys.publicationReadiness('p-1'));
    expect(key).not.toContain('updatedAt');
    expect(key).not.toContain('expected');
  });
});
