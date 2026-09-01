/**
 * @jest-environment node
 *
 * Composition of `/sitemap.xml` (`APP11-S04`).
 *
 * `APP11-B04` owns which *entities* may be advertised and `APP12-C01` owns which
 * *categories* are public; this file covers the half only the Storefront can
 * decide — which browser URLs those become, which fixed routes join them, in
 * what order, and what happens when the composed total would breach the
 * protocol's per-file limit.
 *
 * The category half is the one `APP12-C01-C1` corrected. It used to be four
 * compiled URLs; it is now one URL per **indexable** row of the live inventory,
 * so the fixture below is deliberately arbitrary — asserting the historical four
 * would make this file the place the taxonomy is declared.
 *
 * The capacity cases are arithmetic against programmatically built arrays. Fifty
 * thousand database rows would prove the same property far more slowly and would
 * make the boundary depend on a fixture nobody would maintain.
 */
import { PublicSitemapEntryResponseKind } from '@embroidery/api-client';
import type {
  PublicCategoryInventoryItemResponse,
  PublicSitemapEntryResponse,
} from '@embroidery/api-client';

import {
  composeSitemap,
  PUBLIC_STATIC_ROUTES,
  SITEMAP_MAX_URLS,
  SitemapCapacityExceededError,
} from '../../src/features/storefront-seo';

const ORIGIN = 'https://shop.example.test';

beforeEach(() => {
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
});

function entry(
  kind: PublicSitemapEntryResponse['kind'],
  slug: string,
  updatedAt = '2026-03-04T05:06:07.000Z',
): PublicSitemapEntryResponse {
  return { kind, slug, updatedAt };
}

/**
 * An arbitrary category inventory. Fixture data, never a taxonomy.
 *
 * `tui-vai` is published but **not** indexable: it must reach Discover and must
 * not reach the sitemap, which is the one rule this half of the composition
 * owns.
 */
const CATEGORIES: readonly PublicCategoryInventoryItemResponse[] = [
  { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', isIndexable: true, displayOrder: 7 },
  { slug: 'tui-vai', name: 'Túi vải', isIndexable: false, displayOrder: 8 },
  { slug: 'ao-khoac', name: 'Áo khoác', isIndexable: true, displayOrder: 9 },
];

/** The URLs the fixture inventory contributes: the two indexable ones. */
const CATEGORY_URL_COUNT = CATEGORIES.filter((category) => category.isIndexable).length;

function urls(
  inventory: readonly PublicSitemapEntryResponse[],
  categories: readonly PublicCategoryInventoryItemResponse[] = CATEGORIES,
): string[] {
  return composeSitemap(inventory, categories).map((item) => item.url);
}

/** `count` synthetic entries, built rather than fixtured. */
function inventoryOf(count: number): PublicSitemapEntryResponse[] {
  return Array.from({ length: count }, (_unused, index) =>
    entry(PublicSitemapEntryResponseKind.PRODUCT, `p-${index}`),
  );
}

describe('the static half', () => {
  it('advertises the fixed routes plus the indexable category URLs, each once', () => {
    const composed = urls([]);

    // The fixed routes are the seam working as designed — `PUBLIC_STATIC_ROUTES`
    // grew at S05 and `sitemap.ts` was not touched. The category URLs between
    // `/kham-pha` and `/bo-suu-tap` are **data**: they come from the inventory
    // argument, in its order, and only the indexable ones appear.
    expect(composed).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/kham-pha`,
      `${ORIGIN}/kham-pha?category=mu-luoi-trai`,
      `${ORIGIN}/kham-pha?category=ao-khoac`,
      `${ORIGIN}/bo-suu-tap`,
      `${ORIGIN}/dich-vu`,
      `${ORIGIN}/cau-hoi-thuong-gap`,
      `${ORIGIN}/cua-hang`,
      `${ORIGIN}/chinh-sach/giao-hang`,
      `${ORIGIN}/chinh-sach/thanh-toan`,
      `${ORIGIN}/chinh-sach/doi-tra`,
      `${ORIGIN}/chinh-sach/bao-mat`,
    ]);
    expect(new Set(composed).size).toBe(composed.length);
  });

  it('advertises one URL per indexable category, and no compiled list', () => {
    const categoryUrls = urls([]).filter((url) => url.includes('category='));

    expect(categoryUrls).toHaveLength(CATEGORY_URL_COUNT);
    // The historical four are not privileged, and are absent because they are
    // not in the inventory this call was given.
    for (const historical of ['thu-bong', 'khan', 'quan-ao', 'khac']) {
      expect(categoryUrls.join('\n')).not.toContain(historical);
    }
  });

  it('omits a published but non-indexable category', () => {
    // Discover renders it; a sitemap may not. One read, two rules.
    expect(urls([]).join('\n')).not.toContain('tui-vai');
  });

  it('grows with the inventory, with no source change', () => {
    const extended = urls(
      [],
      [
        ...CATEGORIES,
        { slug: 'danh-muc-moi', name: 'Danh mục mới', isIndexable: true, displayOrder: 99 },
      ],
    );

    expect(extended).toContain(`${ORIGIN}/kham-pha?category=danh-muc-moi`);
  });

  it('emits no category URL at all for an empty inventory', () => {
    const composed = urls([], []);

    expect(composed.filter((url) => url.includes('category='))).toEqual([]);
    expect(composed).toContain(`${ORIGIN}/kham-pha`);
  });

  it('fabricates no lastModified for a route with no authoring timestamp', () => {
    // `Date.now()`, the build time or the request time would each be a freshness
    // claim renewed on every crawl — worse than the absent field a crawler
    // already knows how to handle. A category URL has no timestamp either: the
    // inventory publishes none, and inventing one would be the same defect.
    for (const item of composeSitemap([], CATEGORIES)) {
      expect(item).not.toHaveProperty('lastModified');
    }
  });

  it('advertises the four concrete policies, and never the family placeholder', () => {
    const composed = urls([]);
    const policies = composed.filter((url) => url.includes('/chinh-sach'));

    expect(policies).toHaveLength(4);
    // A literal /chinh-sach/[slug] is a URL that 404s for every crawler that
    // fetches it, and /chinh-sach has no page at all. Neither is advertised.
    expect(composed).not.toContain(ORIGIN + String.raw`/chinh-sach/[slug]`);
    expect(composed).not.toContain(ORIGIN + '/chinh-sach');
  });

  it('advertises no private, Studio or Admin surface', () => {
    const composed = urls([
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'con-tho'),
      entry(PublicSitemapEntryResponseKind.GALLERY, 'mua-he'),
    ]).join('\n');

    for (const forbidden of [
      '/truy-cap',
      '/xac-minh-lien-he',
      '/yeu-cau',
      '/thiet-ke',
      '/admin',
      '/gallery',
      '/discover',
      '/products',
      '/collections',
    ]) {
      expect(composed).not.toContain(forbidden);
    }
  });
});

describe('the dynamic half', () => {
  it('maps PRODUCT through the Product Detail route authority', () => {
    expect(urls([entry(PublicSitemapEntryResponseKind.PRODUCT, 'con-tho')])).toContain(
      `${ORIGIN}/san-pham/con-tho`,
    );
  });

  it('maps GALLERY through the gallery entry route authority', () => {
    expect(urls([entry(PublicSitemapEntryResponseKind.GALLERY, 'mua-he')])).toContain(
      `${ORIGIN}/bo-suu-tap/mua-he`,
    );
  });

  it('carries the entity own updatedAt as lastModified', () => {
    const stamp = '2026-01-02T03:04:05.000Z';
    const composed = composeSitemap(
      [entry(PublicSitemapEntryResponseKind.PRODUCT, 'con-tho', stamp)],
      CATEGORIES,
    );

    expect(composed.at(-1)?.lastModified).toEqual(new Date(stamp));
  });

  it('never re-checks indexability: a noindex entity is absent because B04 excluded it', () => {
    // The consumer holds no second indexability rule. What it advertises is
    // exactly what the authority handed it, which is why an inventory that
    // omits a `noindex` Product produces a sitemap that omits it too.
    expect(urls([])).not.toContain(`${ORIGIN}/san-pham/an-nau`);
  });
});

describe('ordering', () => {
  it('is fixed routes and categories first, then the inventory in B04 order', () => {
    const composed = urls([
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'a'),
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'b'),
      entry(PublicSitemapEntryResponseKind.GALLERY, 'c'),
    ]);
    const head = PUBLIC_STATIC_ROUTES.length + CATEGORY_URL_COUNT;

    expect(composed.slice(0, head)).toEqual(urls([]));
    expect(composed.slice(head)).toEqual([
      `${ORIGIN}/san-pham/a`,
      `${ORIGIN}/san-pham/b`,
      `${ORIGIN}/bo-suu-tap/c`,
    ]);
  });

  it('preserves the inventory order for category URLs rather than sorting them', () => {
    // `ao-khoac` sorts before `mu-luoi-trai` alphabetically, but the API already
    // applied `display_order`; re-sorting here would be a second authority.
    const categoryUrls = urls([]).filter((url) => url.includes('category='));

    expect(categoryUrls).toEqual([
      `${ORIGIN}/kham-pha?category=mu-luoi-trai`,
      `${ORIGIN}/kham-pha?category=ao-khoac`,
    ]);
  });

  it('is deterministic across calls on unchanged input', () => {
    const inventory = inventoryOf(50);
    expect(urls(inventory)).toEqual(urls(inventory));
  });
});

describe('the 50,000-URL protocol invariant', () => {
  const headCount = PUBLIC_STATIC_ROUTES.length + CATEGORY_URL_COUNT;

  it('counts the fixed and category URLs toward the total', () => {
    // This is the whole reason the bound is re-applied here. `APP11-B04-C1`
    // caps the *entity* inventory at 50 000; an inventory of exactly that size
    // would compose into 50 000 plus the fixed routes plus one URL per
    // indexable category — a file that breaches the protocol with every
    // individual check having passed.
    expect(() => composeSitemap(inventoryOf(SITEMAP_MAX_URLS), CATEGORIES)).toThrow(
      SitemapCapacityExceededError,
    );
  });

  it('succeeds at exactly the cap', () => {
    expect(composeSitemap(inventoryOf(SITEMAP_MAX_URLS - headCount), CATEGORIES)).toHaveLength(
      SITEMAP_MAX_URLS,
    );
  });

  it('fails one URL over the cap, and truncates nothing', () => {
    // No partial file, no dropped tail, no preference for fixed over dynamic
    // or Products over gallery entries: a crawler cannot tell a truncated
    // sitemap from a complete one and would read the missing URLs as delisted.
    expect(() => composeSitemap(inventoryOf(SITEMAP_MAX_URLS - headCount + 1), CATEGORIES)).toThrow(
      SitemapCapacityExceededError,
    );
  });

  it('counts a larger category inventory toward the same bound', () => {
    // A category is a URL like any other: adding categories must reduce the
    // number of entities the file can carry, not quietly exceed the limit.
    const manyCategories = Array.from({ length: 100 }, (_unused, index) => ({
      slug: `danh-muc-${index}`,
      name: `Danh mục ${index}`,
      isIndexable: true,
      displayOrder: index,
    }));
    const room = SITEMAP_MAX_URLS - PUBLIC_STATIC_ROUTES.length - manyCategories.length;

    expect(composeSitemap(inventoryOf(room), manyCategories)).toHaveLength(SITEMAP_MAX_URLS);
    expect(() => composeSitemap(inventoryOf(room + 1), manyCategories)).toThrow(
      SitemapCapacityExceededError,
    );
  });
});
