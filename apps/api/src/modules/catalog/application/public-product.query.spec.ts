/**
 * The public catalog query service (`APP2-B04`).
 *
 * A fake repository stands in for persistence so these tests can pin the
 * pagination arithmetic exactly: that the service over-fetches by one, never
 * returns the extra row, and only issues a cursor when a further page really
 * exists. Those are the properties that decide whether a caller sees every
 * product exactly once.
 */
import { PublicProductQuery } from './public-product.query';
import {
  decodePublicProductCursor,
  encodePublicProductCursor,
} from '../domain/public-product-cursor';
import { isPublicProductCatalogError } from '../domain/public-product-catalog.errors';
import type {
  PublicProductDetail,
  PublicProductListQuery,
  PublicProductListRow,
  PublicProductRepository,
} from '../domain/repositories/public-product.repository';

function row(index: number): PublicProductListRow {
  return {
    id: `019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60${String(index).padStart(2, '0')}`,
    displayOrder: index * 10,
    slug: `san-pham-${index}`,
    name: `Sản phẩm ${index}`,
    basePriceAmount: '250000.000',
    currencyCode: 'VND',
    isDisplayOutOfStock: false,
    categorySlug: 'khan',
    categoryName: 'Khăn',
    thumbnailProductMediaId: undefined,
  };
}

class FakeRepository implements PublicProductRepository {
  readonly listCalls: PublicProductListQuery[] = [];
  readonly slugCalls: string[] = [];

  constructor(
    private readonly rows: readonly PublicProductListRow[] = [],
    private readonly detail: PublicProductDetail | undefined = undefined,
  ) {}

  listPublished(query: PublicProductListQuery): Promise<readonly PublicProductListRow[]> {
    this.listCalls.push(query);
    return Promise.resolve(this.rows.slice(0, query.limit));
  }

  findPublishedBySlug(slug: string): Promise<PublicProductDetail | undefined> {
    this.slugCalls.push(slug);
    return Promise.resolve(this.detail);
  }
}

describe('PublicProductQuery', () => {
  it('over-fetches by one and never returns the extra row', async () => {
    const repository = new FakeRepository(Array.from({ length: 25 }, (_, i) => row(i)));
    const page = await new PublicProductQuery(repository).list({ limit: 20 });

    expect(repository.listCalls[0]?.limit).toBe(21);
    expect(page.items).toHaveLength(20);
    expect(page.hasNext).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });

  it('reports the end of the list with a null cursor', async () => {
    const repository = new FakeRepository(Array.from({ length: 3 }, (_, i) => row(i)));
    const page = await new PublicProductQuery(repository).list({ limit: 20 });

    expect(page.items).toHaveLength(3);
    expect(page.hasNext).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('issues a cursor positioned at the last returned row, not the over-fetched one', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i));
    const repository = new FakeRepository(rows);
    const page = await new PublicProductQuery(repository).list({ limit: 4 });

    const last = rows[3]!;
    expect(decodePublicProductCursor(page.nextCursor!, undefined)).toEqual({
      displayOrder: last.displayOrder,
      id: last.id,
    });
  });

  it('passes the decoded position through to the repository', async () => {
    const repository = new FakeRepository([]);
    const cursor = encodePublicProductCursor({
      displayOrder: 30,
      id: 'abc',
      categorySlug: 'khan',
    });
    await new PublicProductQuery(repository).list({ cursor, categorySlug: 'khan' });

    expect(repository.listCalls[0]?.after).toEqual({ displayOrder: 30, id: 'abc' });
    expect(repository.listCalls[0]?.categorySlug).toBe('khan');
  });

  it('binds an issued cursor to the filter it was issued under', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row(i));
    const query = new PublicProductQuery(new FakeRepository(rows));
    const page = await query.list({ limit: 2, categorySlug: 'khan' });

    expect(() => decodePublicProductCursor(page.nextCursor!, 'thu-bong')).toThrow();
    expect(decodePublicProductCursor(page.nextCursor!, 'khan')).toBeDefined();
  });

  it('starts from the beginning when no cursor is supplied', async () => {
    const repository = new FakeRepository([]);
    await new PublicProductQuery(repository).list({ cursor: undefined });
    expect(repository.listCalls[0]?.after).toBeUndefined();
  });

  it('clamps an oversized page size instead of failing', async () => {
    const repository = new FakeRepository([]);
    await new PublicProductQuery(repository).list({ limit: 5000 });
    // 100 is the shared maximum; the +1 is the over-fetch.
    expect(repository.listCalls[0]?.limit).toBe(101);
  });

  it('rejects a nonsensical page size as a safe query error', async () => {
    const query = new PublicProductQuery(new FakeRepository([]));
    const error = await query.list({ limit: 0 }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(isPublicProductCatalogError(error)).toBe(true);
    if (isPublicProductCatalogError(error)) {
      expect(error.code).toBe('PUBLIC_PRODUCT_QUERY_INVALID');
    }
  });

  it('answers an absent product with the single safe not-found', async () => {
    const query = new PublicProductQuery(new FakeRepository([], undefined));
    const error = await query.detail('khong-ton-tai').then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(isPublicProductCatalogError(error)).toBe(true);
    if (isPublicProductCatalogError(error)) {
      expect(error.code).toBe('PUBLIC_PRODUCT_NOT_FOUND');
      // The message must not name the slug or say which predicate failed.
      expect(error.message).toBe('That product is not available.');
      expect(error.message).not.toContain('khong-ton-tai');
    }
  });

  it('looks the detail up by the exact slug it was given', async () => {
    const repository = new FakeRepository([], undefined);
    await new PublicProductQuery(repository).detail('khan-theu-hoa-sen').catch(() => undefined);
    expect(repository.slugCalls).toEqual(['khan-theu-hoa-sen']);
  });
});
