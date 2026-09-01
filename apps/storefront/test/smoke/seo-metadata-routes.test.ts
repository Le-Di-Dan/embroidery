/**
 * @jest-environment node
 *
 * The two framework metadata routes (`APP11-S04`).
 *
 * `robots.ts` and `sitemap.ts` are not pages — they add nothing to the
 * Storefront's page-route count — but they publish the two files a crawler reads
 * first, so what they emit is asserted at the route, not only at the model.
 */
import {
  publicCategoryList,
  publicSitemapEntryList,
  PublicSitemapEntryResponseKind,
} from '@embroidery/api-client';

import robots from '../../src/app/robots';
import sitemap from '../../src/app/sitemap';
import { SitemapCapacityExceededError } from '../../src/features/storefront-seo';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicSitemapEntryList: jest.fn(),
  publicCategoryList: jest.fn(),
}));

const inventoryMock = publicSitemapEntryList as jest.MockedFunction<typeof publicSitemapEntryList>;
// The category URLs are database rows now (`APP12-C01-C1`), so the sitemap
// reads a second inventory. `tui-vai` is published but non-indexable: it must
// reach Discover and must never reach this file.
const categoryMock = publicCategoryList as jest.MockedFunction<typeof publicCategoryList>;

const CATEGORIES = [
  { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', isIndexable: true, displayOrder: 7 },
  { slug: 'tui-vai', name: 'Túi vải', isIndexable: false, displayOrder: 8 },
];

const ORIGIN = 'https://shop.example.test';

beforeEach(() => {
  inventoryMock.mockReset();
  categoryMock.mockReset();
  categoryMock.mockResolvedValue(categoryInventory(CATEGORIES));
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
});

function categoryInventory(items: readonly (typeof CATEGORIES)[number][]) {
  return { data: { items: [...items] } } as unknown as Awaited<
    ReturnType<typeof publicCategoryList>
  >;
}

function inventory(items: { kind: 'PRODUCT' | 'GALLERY'; slug: string }[]) {
  return {
    data: { items: items.map((item) => ({ ...item, updatedAt: '2026-02-01T00:00:00.000Z' })) },
  } as unknown as Awaited<ReturnType<typeof publicSitemapEntryList>>;
}

describe('/robots.txt', () => {
  it('allows the public store', () => {
    expect(robots().rules).toMatchObject({ userAgent: '*', allow: '/' });
  });

  it('disallows every private route family, by prefix rather than by page', () => {
    const disallow = (robots().rules as { disallow: string[] }).disallow;

    expect(disallow).toEqual(
      expect.arrayContaining([
        '/truy-cap',
        '/xac-minh-lien-he',
        '/yeu-cau',
        '/san-pham/*/thiet-ke',
      ]),
    );
  });

  it('does not block the public Product or Gallery detail families wholesale', () => {
    // A `noindex` Product or gallery entry is still a public, readable page —
    // indexability is not visibility — and that decision belongs to the entity's
    // own robots directive, per entity. Blocking the family here would take a
    // per-entity operator decision and apply it to every sibling.
    const disallow = (robots().rules as { disallow: string[] }).disallow;

    expect(disallow).not.toContain('/san-pham');
    expect(disallow).not.toContain('/san-pham/');
    expect(disallow).not.toContain('/bo-suu-tap');
    expect(disallow.some((rule) => /^\/bo-suu-tap/.test(rule))).toBe(false);
  });

  it('advertises exactly one absolute sitemap URL', () => {
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
  });

  it('never mentions the Admin application', () => {
    // Admin is a separate hostname with its own document root. Naming its paths
    // here would neither protect nor even address them, and would publish a map
    // of an application this host does not serve.
    expect(JSON.stringify(robots())).not.toMatch(/admin/i);
  });

  it('leaks no environment detail beyond the public origin', () => {
    const serialized = JSON.stringify(robots());
    expect(serialized).not.toContain('api:4000');
    expect(serialized).not.toMatch(/INTERNAL|PASSWORD|SECRET|TOKEN/i);
  });

  it('fails closed when the public origin is unset', () => {
    delete process.env.STOREFRONT_PUBLIC_ORIGIN;
    expect(() => robots()).toThrow('STOREFRONT_PUBLIC_ORIGIN');
  });
});

describe('/sitemap.xml', () => {
  it('composes fixed routes, category rows and the B04 inventory into absolute URLs', async () => {
    inventoryMock.mockResolvedValue(
      inventory([
        { kind: PublicSitemapEntryResponseKind.PRODUCT, slug: 'con-tho' },
        { kind: PublicSitemapEntryResponseKind.GALLERY, slug: 'mua-he' },
      ]),
    );

    const urls = (await sitemap()).map((item) => item.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/`,
        `${ORIGIN}/kham-pha`,
        // From the inventory, not from a compiled list.
        `${ORIGIN}/kham-pha?category=mu-luoi-trai`,
        `${ORIGIN}/bo-suu-tap`,
        `${ORIGIN}/san-pham/con-tho`,
        `${ORIGIN}/bo-suu-tap/mua-he`,
      ]),
    );
    // The published non-indexable category is browsable but never advertised,
    // and no historical slug survives as a compiled entry.
    expect(urls.join('\n')).not.toContain('tui-vai');
    for (const historical of ['thu-bong', 'quan-ao', 'category=khan', 'category=khac']) {
      expect(urls.join('\n')).not.toContain(historical);
    }
    expect(inventoryMock).toHaveBeenCalledTimes(1);
  });

  it('discovers indexability from the two inventories alone — it fetches no detail', async () => {
    inventoryMock.mockResolvedValue(inventory([]));
    await sitemap();

    // One entity read and one category read, and nothing else. Crawling the
    // public feeds to decide inclusion would fork the indexability authority.
    expect(inventoryMock).toHaveBeenCalledTimes(1);
    expect(categoryMock).toHaveBeenCalledTimes(1);
  });

  it('propagates a category-inventory failure rather than dropping every category URL', async () => {
    // Same reasoning as the entity inventory below: silently omitting every
    // category URL would tell a crawler those feeds have been delisted.
    inventoryMock.mockResolvedValue(inventory([]));
    categoryMock.mockRejectedValue(new Error('categories unavailable'));

    await expect(sitemap()).rejects.toThrow('categories unavailable');
  });

  it('propagates an inventory failure instead of serving a static-only sitemap', async () => {
    // `APP11-B04` answers 503 rather than truncating. Absorbing that here — an
    // empty `<urlset>`, a static-only file, a stale copy — would undo the guard
    // one layer up and tell a crawler the catalogue has been delisted.
    inventoryMock.mockRejectedValue(new Error('inventory unavailable'));

    await expect(sitemap()).rejects.toThrow('inventory unavailable');
  });

  it('fails rather than truncating when the composed total breaches the protocol limit', async () => {
    inventoryMock.mockResolvedValue(
      inventory(
        Array.from({ length: 50_000 }, (_unused, index) => ({
          kind: PublicSitemapEntryResponseKind.PRODUCT,
          slug: `p-${index}`,
        })),
      ),
    );

    await expect(sitemap()).rejects.toThrow(SitemapCapacityExceededError);
  });

  it('fails closed when the public origin is unset', async () => {
    inventoryMock.mockResolvedValue(inventory([]));
    delete process.env.STOREFRONT_PUBLIC_ORIGIN;

    await expect(sitemap()).rejects.toThrow('STOREFRONT_PUBLIC_ORIGIN');
  });
});
