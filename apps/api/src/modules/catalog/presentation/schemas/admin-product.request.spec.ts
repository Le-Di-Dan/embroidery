/**
 * Strict request validation for the Admin product operations.
 *
 * The point of every `.strict()` here is that an unknown field is reported
 * rather than dropped: a caller that misspells `basePrice` must learn it did
 * not set a price, not discover it later in the catalog.
 */
import {
  archiveProductBodySchema,
  createProductBodySchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductBodySchema,
} from './admin-product.request';

const UPDATED_AT = '2026-07-31T10:00:00.000Z';
const ASSET_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const ASSET_B = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';

describe('create product body', () => {
  it('accepts a locked category slug with a name', () => {
    const parsed = createProductBodySchema.parse({ categorySlug: 'thu-bong', name: 'Gấu nâu' });
    expect(parsed).toEqual({ categorySlug: 'thu-bong', name: 'Gấu nâu' });
  });

  it('rejects a category outside the closed APP2 taxonomy', () => {
    expect(createProductBodySchema.safeParse({ categorySlug: 'do-choi', name: 'X' }).success).toBe(
      false,
    );
  });

  it('rejects every server-owned field', () => {
    for (const extra of [
      { slug: 'gau-nau' },
      { status: 'PUBLISHED' },
      { currencyCode: 'USD' },
      { displayOrder: 5 },
      { basePriceAmount: '1000' },
      { isIndexable: false },
    ]) {
      const result = createProductBodySchema.safeParse({
        categorySlug: 'thu-bong',
        name: 'Gấu nâu',
        ...extra,
      });
      expect({ extra, ok: result.success }).toEqual({ extra, ok: false });
    }
  });

  it('requires a non-empty name', () => {
    expect(createProductBodySchema.safeParse({ categorySlug: 'khan', name: '' }).success).toBe(
      false,
    );
    expect(createProductBodySchema.safeParse({ categorySlug: 'khan', name: '   ' }).success).toBe(
      false,
    );
  });
});

describe('update product body', () => {
  it('requires the concurrency token', () => {
    expect(updateProductBodySchema.safeParse({ name: 'Mới' }).success).toBe(false);
  });

  it('requires at least one change', () => {
    expect(updateProductBodySchema.safeParse({ expectedUpdatedAt: UPDATED_AT }).success).toBe(
      false,
    );
  });

  it('accepts an explicit null description as a clear', () => {
    const parsed = updateProductBodySchema.parse({
      expectedUpdatedAt: UPDATED_AT,
      description: null,
    });
    expect(parsed.description).toBeNull();
  });

  it('accepts a whole-đồng price as a string and rejects a JSON number', () => {
    expect(
      updateProductBodySchema.parse({ expectedUpdatedAt: UPDATED_AT, basePriceAmount: '250000' })
        .basePriceAmount,
    ).toBe('250000');
    expect(
      updateProductBodySchema.safeParse({ expectedUpdatedAt: UPDATED_AT, basePriceAmount: 250_000 })
        .success,
    ).toBe(false);
  });

  it('rejects a fractional, negative, separated or oversized amount', () => {
    for (const amount of ['250000.50', '-1', '250,000', '1e5', '', '9999999999999']) {
      const result = updateProductBodySchema.safeParse({
        expectedUpdatedAt: UPDATED_AT,
        basePriceAmount: amount,
      });
      expect({ amount, ok: result.success }).toEqual({ amount, ok: false });
    }
  });

  it('accepts an ordered media selection and an explicit empty one', () => {
    expect(
      updateProductBodySchema.parse({
        expectedUpdatedAt: UPDATED_AT,
        mediaAssetIds: [ASSET_A, ASSET_B],
      }).mediaAssetIds,
    ).toEqual([ASSET_A, ASSET_B]);
    expect(
      updateProductBodySchema.parse({ expectedUpdatedAt: UPDATED_AT, mediaAssetIds: [] })
        .mediaAssetIds,
    ).toEqual([]);
  });

  it('never accepts a client-chosen slug, status or media role', () => {
    for (const extra of [
      { slug: 'x' },
      { status: 'ARCHIVED' },
      { media: [{ assetId: ASSET_A, role: 'DETAIL' }] },
      { displayOrder: 3 },
    ]) {
      const result = updateProductBodySchema.safeParse({ expectedUpdatedAt: UPDATED_AT, ...extra });
      expect({ extra, ok: result.success }).toEqual({ extra, ok: false });
    }
  });
});

describe('archive product body', () => {
  it('requires the concurrency token and nothing else', () => {
    expect(archiveProductBodySchema.parse({ expectedUpdatedAt: UPDATED_AT })).toEqual({
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(archiveProductBodySchema.safeParse({}).success).toBe(false);
    expect(
      archiveProductBodySchema.safeParse({ expectedUpdatedAt: UPDATED_AT, force: true }).success,
    ).toBe(false);
  });
});

describe('list products query', () => {
  it('bounds the page size and rejects an unusable one', () => {
    expect(listProductsQuerySchema.parse({ limit: '25' }).limit).toBe(25);
    for (const limit of ['0', '-1', '101', 'abc']) {
      expect({ limit, ok: listProductsQuerySchema.safeParse({ limit }).success }).toEqual({
        limit,
        ok: false,
      });
    }
  });

  it('accepts every lifecycle filter, so archived rows are never silently hidden', () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED']) {
      expect(listProductsQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('accepts only a locked category slug and rejects an unknown filter', () => {
    expect(listProductsQuerySchema.safeParse({ categorySlug: 'quan-ao' }).success).toBe(true);
    expect(listProductsQuerySchema.safeParse({ categorySlug: 'nonsense' }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ offset: 20 }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ search: 'gấu' }).success).toBe(false);
  });
});

describe('product id parameter', () => {
  it('rejects a non-uuid before any repository call', () => {
    expect(productIdParamSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(false);
    expect(
      productIdParamSchema.safeParse({ productId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' }).success,
    ).toBe(true);
  });
});
