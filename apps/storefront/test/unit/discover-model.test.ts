/**
 * @jest-environment node
 *
 * Pure model rules for the Discover feed. These are the decisions a keyset feed
 * gets wrong silently — a cursor requested past the end, a duplicate appended
 * after a republish, an unknown category answered as "everything" — so they are
 * tested without a DOM, independently of how any component renders them.
 */
import {
  DISCOVER_CATEGORIES,
  DISCOVER_CATEGORY_SLUGS,
  toDiscoverCategorySlug,
} from '../../src/features/product-discovery/model/discover-categories';
import {
  flattenDiscoverPages,
  nextCursorOf,
  toDiscoverCard,
} from '../../src/features/product-discovery/model/discover-feed';
import { discoverQueryKeys } from '../../src/features/product-discovery/model/discover-query-keys';
import {
  buildDiscoverHref,
  DISCOVER_CATEGORY_QUERY_KEY,
  DISCOVER_ROUTE,
} from '../../src/features/product-discovery/model/discover-route';
import { resolveDiscoverSelection } from '../../src/features/product-discovery/model/discover-selection';
import {
  makePublicPage,
  makePublicProduct,
  makePublicProductWithoutThumbnail,
} from '../support/discover-fixture';

describe('Discover route authority (IMP-D038)', () => {
  it('is exactly /kham-pha with no trailing slash', () => {
    expect(DISCOVER_ROUTE).toBe('/kham-pha');
  });

  it('never spells the route as a rejected alias', () => {
    for (const rejected of ['/discover', '/catalog', '/products', '/san-pham']) {
      expect(DISCOVER_ROUTE).not.toBe(rejected);
    }
  });

  it('omits the query for "all" and uses the locked key otherwise', () => {
    expect(DISCOVER_CATEGORY_QUERY_KEY).toBe('category');
    expect(buildDiscoverHref(undefined)).toBe('/kham-pha');
    expect(buildDiscoverHref('thu-bong')).toBe('/kham-pha?category=thu-bong');
  });
});

describe('Discover categories', () => {
  it('derives the four slugs from the contract enum', () => {
    expect(DISCOVER_CATEGORY_SLUGS).toEqual(['thu-bong', 'khan', 'quan-ao', 'khac']);
  });

  it('offers five choices, "Tất cả" first', () => {
    expect(DISCOVER_CATEGORIES.map((category) => category.label)).toEqual([
      'Tất cả',
      'Thú bông',
      'Khăn',
      'Quần áo',
      'Khác',
    ]);
    expect(DISCOVER_CATEGORIES[0]?.slug).toBeUndefined();
  });

  it('narrows only contract slugs', () => {
    expect(toDiscoverCategorySlug('khan')).toBe('khan');
    expect(toDiscoverCategorySlug('KHAN')).toBeUndefined();
    expect(toDiscoverCategorySlug('do-choi')).toBeUndefined();
    expect(toDiscoverCategorySlug(undefined)).toBeUndefined();
  });
});

describe('category URL resolution', () => {
  it('treats an absent query as the unfiltered feed', () => {
    expect(resolveDiscoverSelection({})).toEqual({ kind: 'all' });
  });

  it('resolves each of the four slugs', () => {
    for (const slug of DISCOVER_CATEGORY_SLUGS) {
      expect(resolveDiscoverSelection({ category: slug })).toEqual({ kind: 'category', slug });
    }
  });

  it('rejects an unknown value rather than quietly showing everything', () => {
    expect(resolveDiscoverSelection({ category: 'khong-ton-tai' })).toEqual({ kind: 'invalid' });
    expect(resolveDiscoverSelection({ category: '' })).toEqual({ kind: 'invalid' });
  });

  it('rejects a repeated parameter, which names no single selection', () => {
    expect(resolveDiscoverSelection({ category: ['khan', 'khac'] })).toEqual({ kind: 'invalid' });
  });

  it('ignores unrelated query parameters', () => {
    expect(resolveDiscoverSelection({ utm_source: 'newsletter' })).toEqual({ kind: 'all' });
  });
});

describe('query keys', () => {
  it('puts the category in the key so a change starts a new cursor sequence', () => {
    expect(discoverQueryKeys.list(undefined)).not.toEqual(discoverQueryKeys.list('khan'));
    expect(discoverQueryKeys.list('khan')).not.toEqual(discoverQueryKeys.list('khac'));
    expect(discoverQueryKeys.list('khan')).toEqual(discoverQueryKeys.list('khan'));
  });
});

describe('card projection', () => {
  it('keeps only what the card may render', () => {
    const card = toDiscoverCard(makePublicProduct());
    expect(card).toEqual({
      slug: 'gau-bong-theu-tay',
      name: 'Gấu bông thêu tay',
      categoryName: 'Thú bông',
      thumbnailUrl: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
    });
    // Price and the stock flag are dropped at the boundary, not merely unrendered.
    expect(Object.keys(card)).not.toContain('price');
    expect(Object.keys(card)).not.toContain('isDisplayOutOfStock');
  });

  it('omits the thumbnail rather than inventing a URL', () => {
    const card = toDiscoverCard(makePublicProductWithoutThumbnail());
    expect(card.thumbnailUrl).toBeUndefined();
  });
});

describe('page flattening', () => {
  it('preserves server order across pages', () => {
    const cards = flattenDiscoverPages([
      makePublicPage([makePublicProduct({ slug: 'a' }), makePublicProduct({ slug: 'b' })], 'c1'),
      makePublicPage([makePublicProduct({ slug: 'c' })]),
    ]);
    expect(cards.map((card) => card.slug)).toEqual(['a', 'b', 'c']);
  });

  it('drops a product that reappears under a later cursor, keeping the first', () => {
    const cards = flattenDiscoverPages([
      makePublicPage([makePublicProduct({ slug: 'a', name: 'Bản đầu' })], 'c1'),
      makePublicPage([makePublicProduct({ slug: 'a', name: 'Bản sau' })]),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe('Bản đầu');
  });
});

describe('cursor gating', () => {
  it('continues only when the page both claims and supplies a successor', () => {
    expect(nextCursorOf(makePublicPage([], 'cursor-1'))).toBe('cursor-1');
  });

  it('stops on the last page', () => {
    expect(nextCursorOf(makePublicPage([]))).toBeUndefined();
    expect(nextCursorOf(undefined)).toBeUndefined();
  });

  it('stops when hasNext is true but no usable cursor came with it', () => {
    expect(nextCursorOf({ items: [], hasNext: true, nextCursor: null })).toBeUndefined();
    expect(nextCursorOf({ items: [], hasNext: true, nextCursor: '' })).toBeUndefined();
  });
});
