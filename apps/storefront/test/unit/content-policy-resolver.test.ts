/**
 * @jest-environment node
 *
 * The policy resolver and the closed policy set (`APP11-S05`).
 *
 * `/chinh-sach/[slug]` is the only place in S05 where a URL segment reaches
 * application code, so this file covers the whole of that boundary: which slugs
 * resolve, that nothing else does, and that the set the footer and the sitemap
 * advertise is the same set the router matches.
 */
import {
  getStorefrontPolicy,
  POLICY_IDS,
  POLICY_SLUG,
  STOREFRONT_POLICY_PAGES,
} from '../../src/features/content-pages';

describe('the canonical policy set', () => {
  it('is exactly the four subjects the Product Requirements require', () => {
    expect(POLICY_IDS).toEqual(['shipping', 'payment', 'returns', 'privacy']);
    expect(Object.values(POLICY_SLUG)).toEqual(['giao-hang', 'thanh-toan', 'doi-tra', 'bao-mat']);
  });

  it('adds no fifth policy — terms, warranty, cookies, refund, legal, community', () => {
    for (const absent of ['dieu-khoan', 'bao-hanh', 'cookie', 'hoan-tien', 'phap-ly']) {
      expect(getStorefrontPolicy(absent)).toBeUndefined();
    }
  });

  it('advertises the four in one order, and that order is the resolver’s', () => {
    expect(STOREFRONT_POLICY_PAGES.map((page) => page.path)).toEqual([
      '/chinh-sach/giao-hang',
      '/chinh-sach/thanh-toan',
      '/chinh-sach/doi-tra',
      '/chinh-sach/bao-mat',
    ]);
  });
});

describe('resolving a slug', () => {
  it.each(Object.values(POLICY_SLUG))('resolves %s to its own page', (slug) => {
    const page = getStorefrontPolicy(slug);

    expect(page).toBeDefined();
    expect(page?.path).toBe(`/chinh-sach/${slug}`);
  });

  it('gives every policy a single H1, an eyebrow and a non-linked parent label', () => {
    for (const page of STOREFRONT_POLICY_PAGES) {
      expect(page.heading).not.toHaveLength(0);
      expect(page.eyebrow).toBe('Chính sách');
      // Plain text, because `/chinh-sach` has no page.tsx to link to.
      expect(page.trail).toEqual({ parentLabel: 'Chính sách' });
    }
  });
});

describe('anything else is a miss, not a redirect and not a partial match', () => {
  /**
   * A prototype key is the classic way an object-literal lookup returns
   * something the caller never stored. It takes the same branch as any other
   * unknown slug because the map is read through an explicit slug→id lookup.
   */
  it.each([
    ['an unknown slug', 'khong-ton-tai'],
    ['the empty string', ''],
    ['the parameterised path itself', '[slug]'],
    ['a prototype key', 'constructor'],
    ['another prototype key', '__proto__'],
    ['a traversal attempt', '../bao-mat'],
    ['a percent-encoded known slug', '%62ao-mat'],
    ['a known slug with a query appended', 'bao-mat?x=1'],
    ['a known slug in the wrong case', 'BAO-MAT'],
    ['a very long slug', 'a'.repeat(2048)],
  ])('%s resolves to undefined', (_label, slug) => {
    expect(getStorefrontPolicy(slug)).toBeUndefined();
  });
});
