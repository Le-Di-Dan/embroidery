/**
 * @jest-environment node
 *
 * Pure model rules for the Discover feed. These are the decisions a keyset feed
 * gets wrong silently — a cursor requested past the end, a duplicate appended
 * after a republish, an unknown category answered as "everything" — so they are
 * tested without a DOM, independently of how any component renders them.
 */
import {
  isKnownCategory,
  toDiscoverChips,
  type DiscoverCategory,
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
    // An arbitrary slug, deliberately: the builder is shape logic and knows no
    // taxonomy. Using a fixture value here rather than a "real" category is the
    // point — nothing in this app decides which categories exist.
    expect(buildDiscoverHref('mu-luoi-trai')).toBe('/kham-pha?category=mu-luoi-trai');
  });
});

/**
 * An arbitrary inventory, as `GET /api/public/categories` would return it.
 *
 * These values are **fixture data**, not a taxonomy: they are deliberately not
 * the four categories migration `0033` seeded, so a test cannot quietly become
 * the place the store's categories are declared (`APP12-C01-C1`).
 */
const INVENTORY: readonly DiscoverCategory[] = [
  { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', isIndexable: true, displayOrder: 7 },
  { slug: 'tui-vai', name: 'Túi vải', isIndexable: false, displayOrder: 3 },
];

describe('Discover categories are the database inventory', () => {
  it('renders one chip per row, labelled by the row name', () => {
    expect(toDiscoverChips(INVENTORY).map((chip) => chip.label)).toEqual([
      'Tất cả',
      'Mũ lưỡi trai',
      'Túi vải',
    ]);
  });

  it('leads with "Tất cả", which carries no slug because it is not a category', () => {
    const [first] = toDiscoverChips(INVENTORY);
    expect(first?.slug).toBeUndefined();
    expect(first?.id).toBe('all');
  });

  it('preserves the API order rather than sorting by slug or label', () => {
    // `tui-vai` has the lower `displayOrder`, but the API already applied the
    // ordering; re-sorting here would be a second ordering authority. The chips
    // therefore come back in the order they were given.
    expect(toDiscoverChips(INVENTORY).map((chip) => chip.slug)).toEqual([
      undefined,
      'mu-luoi-trai',
      'tui-vai',
    ]);
  });

  it('includes a non-indexable category, because Discover is not a sitemap', () => {
    expect(toDiscoverChips(INVENTORY).some((chip) => chip.slug === 'tui-vai')).toBe(true);
  });

  it('renders an empty inventory as the "all" chip alone, inventing nothing', () => {
    expect(toDiscoverChips([])).toEqual([{ id: 'all', label: 'Tất cả' }]);
  });

  it('answers membership from the rows it was given', () => {
    expect(isKnownCategory(INVENTORY, 'mu-luoi-trai')).toBe(true);
    // A historical category is not privileged: if it is not in the inventory,
    // it is not a category.
    expect(isKnownCategory(INVENTORY, 'thu-bong')).toBe(false);
    expect(isKnownCategory([], 'mu-luoi-trai')).toBe(false);
  });
});

describe('category URL resolution', () => {
  it('treats an absent query as the unfiltered feed', () => {
    expect(resolveDiscoverSelection({}, INVENTORY)).toEqual({ kind: 'all' });
  });

  it('resolves any slug the inventory currently contains', () => {
    for (const category of INVENTORY) {
      expect(resolveDiscoverSelection({ category: category.slug }, INVENTORY)).toEqual({
        kind: 'category',
        slug: category.slug,
      });
    }
  });

  it('rejects a well-formed slug the inventory does not contain', () => {
    // Not "quietly show everything", and not "trust any slug": the inventory
    // decides, so an archived or draft category stops resolving the moment the
    // database says so — with no deployment.
    expect(resolveDiscoverSelection({ category: 'khong-ton-tai' }, INVENTORY)).toEqual({
      kind: 'invalid',
    });
  });

  it('rejects a malformed value on syntax alone', () => {
    for (const category of ['', 'MU-LUOI-TRAI', 'mu_luoi_trai', 'mu luoi trai', '-mu']) {
      expect({ category, selection: resolveDiscoverSelection({ category }, INVENTORY) }).toEqual({
        category,
        selection: { kind: 'invalid' },
      });
    }
  });

  it('falls back to syntax when the inventory could not be read', () => {
    // `undefined` is *unknown*, not *empty*. Narrowing against an inventory the
    // app does not have would 404 perfectly valid categories during an API blip,
    // and remembering a previous list would resurrect the compiled taxonomy.
    expect(resolveDiscoverSelection({ category: 'bat-ky-danh-muc' }, undefined)).toEqual({
      kind: 'category',
      slug: 'bat-ky-danh-muc',
    });
    expect(resolveDiscoverSelection({ category: 'KHONG HOP LE' }, undefined)).toEqual({
      kind: 'invalid',
    });
  });

  it('treats an empty inventory as "no category resolves", not as unknown', () => {
    expect(resolveDiscoverSelection({ category: 'mu-luoi-trai' }, [])).toEqual({ kind: 'invalid' });
  });

  it('rejects a repeated parameter, which names no single selection', () => {
    expect(resolveDiscoverSelection({ category: ['mu-luoi-trai', 'tui-vai'] }, INVENTORY)).toEqual({
      kind: 'invalid',
    });
  });

  it('ignores unrelated query parameters', () => {
    expect(resolveDiscoverSelection({ utm_source: 'newsletter' }, INVENTORY)).toEqual({
      kind: 'all',
    });
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
