/**
 * @jest-environment node
 *
 * Composition of `/sitemap.xml` (`APP11-S04`).
 *
 * `APP11-B04` owns which *entities* may be advertised; this file covers the half
 * only the Storefront can decide — which browser URLs those entities become,
 * which fixed routes join them, in what order, and what happens when the
 * composed total would breach the protocol's per-file limit.
 *
 * The capacity cases are arithmetic against programmatically built arrays. Fifty
 * thousand database rows would prove the same property far more slowly and would
 * make the boundary depend on a fixture nobody would maintain.
 */
import { PublicSitemapEntryResponseKind } from '@embroidery/api-client';
import type { PublicSitemapEntryResponse } from '@embroidery/api-client';

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

function urls(inventory: readonly PublicSitemapEntryResponse[]): string[] {
  return composeSitemap(inventory).map((item) => item.url);
}

/** `count` synthetic entries, built rather than fixtured. */
function inventoryOf(count: number): PublicSitemapEntryResponse[] {
  return Array.from({ length: count }, (_unused, index) =>
    entry(PublicSitemapEntryResponseKind.PRODUCT, `p-${index}`),
  );
}

describe('the static half', () => {
  it('advertises the routes that exist at S05 exit, each exactly once', () => {
    const composed = urls([]);

    // Seven at S04 exit, fourteen at S05: the three singular content routes and
    // the four concrete policies. The list is the seam working as designed —
    // `PUBLIC_STATIC_ROUTES` grew, `sitemap.ts` was not touched.
    expect(composed).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/kham-pha`,
      `${ORIGIN}/kham-pha?category=thu-bong`,
      `${ORIGIN}/kham-pha?category=khan`,
      `${ORIGIN}/kham-pha?category=quan-ao`,
      `${ORIGIN}/kham-pha?category=khac`,
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

  it('advertises exactly the four canonical category states', () => {
    const categories = urls([]).filter((url) => url.includes('category='));
    expect(categories).toHaveLength(4);
  });

  it('fabricates no lastModified for a route with no authoring timestamp', () => {
    // `Date.now()`, the build time or the request time would each be a freshness
    // claim renewed on every crawl — worse than the absent field a crawler
    // already knows how to handle.
    for (const item of composeSitemap([])) {
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
    const composed = composeSitemap([
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'con-tho', stamp),
    ]);

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
  it('is static-first, then the inventory in the order B04 supplied it', () => {
    const composed = urls([
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'a'),
      entry(PublicSitemapEntryResponseKind.PRODUCT, 'b'),
      entry(PublicSitemapEntryResponseKind.GALLERY, 'c'),
    ]);

    expect(composed.slice(0, PUBLIC_STATIC_ROUTES.length)).toEqual(urls([]));
    expect(composed.slice(PUBLIC_STATIC_ROUTES.length)).toEqual([
      `${ORIGIN}/san-pham/a`,
      `${ORIGIN}/san-pham/b`,
      `${ORIGIN}/bo-suu-tap/c`,
    ]);
  });

  it('is deterministic across calls on unchanged input', () => {
    const inventory = inventoryOf(50);
    expect(urls(inventory)).toEqual(urls(inventory));
  });
});

describe('the 50,000-URL protocol invariant', () => {
  const staticCount = PUBLIC_STATIC_ROUTES.length;

  it('counts the static and category URLs toward the total', () => {
    // This is the whole reason the bound is re-applied here. `APP11-B04-C1`
    // caps the *inventory* at 50 000; an inventory of exactly that size would
    // compose into 50 000 + 7 URLs, a file that breaches the protocol with
    // every individual check having passed.
    expect(() => composeSitemap(inventoryOf(SITEMAP_MAX_URLS))).toThrow(
      SitemapCapacityExceededError,
    );
  });

  it('succeeds at exactly the cap', () => {
    expect(composeSitemap(inventoryOf(SITEMAP_MAX_URLS - staticCount))).toHaveLength(
      SITEMAP_MAX_URLS,
    );
  });

  it('fails one URL over the cap, and truncates nothing', () => {
    // No partial file, no dropped tail, no preference for static over dynamic
    // or Products over gallery entries: a crawler cannot tell a truncated
    // sitemap from a complete one and would read the missing URLs as delisted.
    expect(() => composeSitemap(inventoryOf(SITEMAP_MAX_URLS - staticCount + 1))).toThrow(
      SitemapCapacityExceededError,
    );
  });
});
