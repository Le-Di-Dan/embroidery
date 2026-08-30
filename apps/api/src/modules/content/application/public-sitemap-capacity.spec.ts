/**
 * The combined sitemap capacity invariant (`APP11-B04-C1`).
 *
 * `PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES` bounds one sitemap *file*, so it is a
 * bound on the sum of the two kinds. The corrected checkpoint replaced a
 * per-kind cap that admitted 30 000 Products plus 30 000 gallery entries —
 * 60 000 URLs in one response, with neither half tripping its own guard.
 *
 * Proved here with repository fakes and no database: the rule is arithmetic
 * over two row counts, and seeding tens of thousands of real rows would prove
 * nothing further while making the fact unaffordable to assert. What the
 * fakes cannot fake is the bound they are asked for — the query passes its own
 * `limit`, and these assertions read it back.
 */
import {
  PUBLIC_PRODUCT_REPOSITORY,
  type PublicProductRepository,
} from '../../catalog/domain/repositories/public-product.repository';
import {
  PUBLIC_GALLERY_ENTRY_REPOSITORY,
  type PublicGalleryEntryRepository,
} from '../../gallery/domain/repositories/public-gallery-entry.repository';
import { isPublicSitemapError } from '../domain/public-sitemap.errors';
import { PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES } from '../domain/public-sitemap.policy';
import { PublicSitemapQuery } from './public-sitemap.query';

const CAP = PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES;
const STAMP = new Date('2026-08-30T09:15:00.000Z');

/** `count` rows with distinct, ascending slugs — the shape both ports return. */
function rows(prefix: string, count: number): readonly { slug: string; updatedAt: Date }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    slug: `${prefix}-${String(index).padStart(6, '0')}`,
    updatedAt: STAMP,
  }));
}

/** Records the bound it was asked for, then honours it exactly as SQL would. */
function source(prefix: string, available: number) {
  const all = rows(prefix, available);
  const limits: number[] = [];
  return {
    limits,
    listIndexable: (limit: number) => {
      limits.push(limit);
      return Promise.resolve(all.slice(0, limit));
    },
  };
}

/** Every other port method is unreachable from this query, and says so. */
function unreachable(name: string): never {
  throw new Error(`PublicSitemapQuery must not call ${name}`);
}

function queryWith(productCount: number, galleryCount: number) {
  const products = source('san-pham', productCount);
  const gallery = source('bo-suu-tap', galleryCount);

  const productPort: PublicProductRepository = {
    listIndexable: products.listIndexable,
    listPublished: () => unreachable('listPublished'),
    findPublishedBySlug: () => unreachable('findPublishedBySlug'),
    findPublishedSummaryById: () => unreachable('findPublishedSummaryById'),
  };
  const galleryPort: PublicGalleryEntryRepository = {
    listIndexable: gallery.listIndexable,
    listPublished: () => unreachable('listPublished'),
    findPublishedBySlug: () => unreachable('findPublishedBySlug'),
  };

  return { query: new PublicSitemapQuery(productPort, galleryPort), products, gallery };
}

async function overflowOf(query: PublicSitemapQuery): Promise<string> {
  try {
    await query.list();
  } catch (error: unknown) {
    return isPublicSitemapError(error) ? error.code : `unexpected: ${String(error)}`;
  }
  return 'no error thrown';
}

describe('APP11-B04-C1 combined sitemap capacity', () => {
  it('names the two injection tokens the composed graph provides', () => {
    // The fakes stand in for exactly these two ports and no third source.
    expect([PUBLIC_PRODUCT_REPOSITORY, PUBLIC_GALLERY_ENTRY_REPOSITORY]).toHaveLength(2);
    expect(CAP).toBe(50_000);
  });

  describe('within the combined cap', () => {
    it.each([
      ['products alone fill the inventory', CAP, 0],
      ['gallery alone fills the inventory', 0, CAP],
      ['a half-and-half inventory exactly reaches the cap', CAP / 2, CAP / 2],
      ['one under the cap', CAP - 1, 0],
    ])('returns the complete inventory when %s', async (_label, productCount, galleryCount) => {
      const { query } = queryWith(productCount, galleryCount);

      const view = await query.list();

      expect(view.items).toHaveLength(productCount + galleryCount);
      expect(view.items.filter((item) => item.kind === 'PRODUCT')).toHaveLength(productCount);
      expect(view.items.filter((item) => item.kind === 'GALLERY')).toHaveLength(galleryCount);
    });

    it('keeps kind-then-slug ordering across the boundary case', async () => {
      const { query } = queryWith(2, 2);

      const view = await query.list();

      expect(view.items.map((item) => `${item.kind}:${item.slug}`)).toEqual([
        'PRODUCT:san-pham-000000',
        'PRODUCT:san-pham-000001',
        'GALLERY:bo-suu-tap-000000',
        'GALLERY:bo-suu-tap-000001',
      ]);
    });
  });

  describe('over the combined cap', () => {
    it.each([
      ['a mixed inventory neither kind alone would trip', 30_000, 20_001],
      ['the same overflow with the kinds swapped', 20_001, 30_000],
      ['products at the cap plus a single gallery entry', CAP, 1],
      ['a single product plus gallery at the cap', 1, CAP],
      ['products alone one over the cap', CAP + 1, 0],
      ['gallery alone one over the cap', 0, CAP + 1],
    ])('fails with 503 semantics when %s', async (_label, productCount, galleryCount) => {
      const { query } = queryWith(productCount, galleryCount);

      expect(await overflowOf(query)).toBe('PUBLIC_SITEMAP_INVENTORY_TOO_LARGE');
    });

    it('returns nothing partial: the overflow throws instead of resolving', async () => {
      const { query } = queryWith(30_000, 20_001);

      // No `items`, no truncated half and no preferred kind — the caller gets an
      // error object, never a shorter inventory it would read as complete.
      await expect(query.list()).rejects.toMatchObject({
        code: 'PUBLIC_SITEMAP_INVENTORY_TOO_LARGE',
      });
    });
  });

  describe('the bound each source is asked for', () => {
    it('is one above the *combined* cap, so neither kind is capped below it', async () => {
      const { query, products, gallery } = queryWith(10, 10);

      await query.list();

      // Not `CAP / 2`: either kind alone may legitimately fill the whole file,
      // and a half-bound would silently truncate that inventory.
      expect(products.limits).toEqual([CAP + 1]);
      expect(gallery.limits).toEqual([CAP + 1]);
    });

    it('detects overflow rather than truncating to it', async () => {
      const { query, products } = queryWith(CAP + 1, 0);

      expect(await overflowOf(query)).toBe('PUBLIC_SITEMAP_INVENTORY_TOO_LARGE');
      // The extra row exists only to be counted; it is never projected.
      expect(products.limits).toEqual([CAP + 1]);
    });
  });
});
