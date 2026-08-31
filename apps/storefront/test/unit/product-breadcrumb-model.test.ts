/**
 * @jest-environment node
 *
 * The Product Detail breadcrumb resolution rule (`APP11-S04-C1`).
 *
 * The committed contract declares a Product's `category.slug` and Discover's
 * filter as the *same* closed four-value enum, so the generated types say the
 * mismatch this rule guards cannot happen. It happens: `categories.slug` is an
 * unconstrained `text` column, the database holds a fifth category, and the live
 * API returns it. `APP11-S04` trusted the declared type and therefore linked —
 * and advertised in `BreadcrumbList` — a `/kham-pha?category=<slug>` URL that
 * Discover answers with its not-found boundary.
 *
 * What this file pins is the rule that replaced that assumption, and the fact
 * that no mapping was invented to paper over it. The in-contract slugs are taken
 * from the enum rather than transcribed; the out-of-contract case is the reason
 * the rule exists at all.
 */
import { PublicProductListCategorySlug } from '@embroidery/api-client';

import { buildDiscoverHref, DISCOVER_ROUTE } from '../../src/features/product-discovery';
import { resolveProductBreadcrumb } from '../../src/features/product-detail';

const PRODUCT = { name: 'Áo thun cotton', categoryName: 'Áo thun', categorySlug: 'ao-thun' };

/** The four contract slugs, taken from the enum rather than transcribed. */
const CANONICAL_SLUGS = Object.values(PublicProductListCategorySlug);

describe('a Product whose category is a canonical Discover filter', () => {
  it.each(CANONICAL_SLUGS)('resolves three levels for %s', (slug) => {
    const items = resolveProductBreadcrumb({
      name: 'Một tác phẩm',
      categoryName: 'Nhãn danh mục',
      categorySlug: slug,
    });

    expect(items).toEqual([
      { name: 'Khám phá', path: DISCOVER_ROUTE },
      { name: 'Nhãn danh mục', path: buildDiscoverHref(slug) },
      { name: 'Một tác phẩm' },
    ]);
  });

  it('builds the category href through the one Discover builder', () => {
    // Never a literal: the crumb, the Discover chips and the sitemap's four
    // category URLs are composed by one function and cannot disagree about how
    // a category is addressed.
    const items = resolveProductBreadcrumb({
      name: 'Khăn tay',
      categoryName: 'Khăn',
      categorySlug: 'khan',
    });

    expect(items[1]?.path).toBe(buildDiscoverHref('khan'));
    expect(items[1]?.path).toBe('/kham-pha?category=khan');
  });
});

describe('a Product whose category is not a Discover filter', () => {
  it('resolves two levels and emits no category crumb', () => {
    expect(resolveProductBreadcrumb(PRODUCT)).toEqual([
      { name: 'Khám phá', path: DISCOVER_ROUTE },
      { name: 'Áo thun cotton' },
    ]);
  });

  it.each(['ao-thun', 'khong-ton-tai', '', 'THU-BONG', 'thu bong', 'quan-ao-nam'])(
    'drops the crumb for %s rather than repairing it',
    (categorySlug) => {
      const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug });

      expect(items).toHaveLength(2);
      expect(JSON.stringify(items)).not.toContain('category=');
    },
  );

  it('invents no mapping onto a canonical category', () => {
    // `ao-thun` is not quietly rewritten to `quan-ao` or to anything else. No
    // repository authority defines such a mapping, and inventing a coarse
    // taxonomy here would be this module deciding what the catalogue means.
    const serialized = JSON.stringify(resolveProductBreadcrumb(PRODUCT));

    for (const slug of CANONICAL_SLUGS) {
      expect(serialized).not.toContain(slug);
    }
  });

  it('still names Khám phá, which really is where the Product was reached from', () => {
    const items = resolveProductBreadcrumb(PRODUCT);

    expect(items[0]).toEqual({ name: 'Khám phá', path: DISCOVER_ROUTE });
  });
});

describe('the shape both consumers depend on', () => {
  it('gives the current Product a name and no path, in either branch', () => {
    // The last item is never a link — the same reason the visible crumb is text
    // and the JSON-LD item carries no `item` URL.
    for (const categorySlug of ['khan', 'ao-thun']) {
      const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug });

      expect(items.at(-1)).toEqual({ name: 'Áo thun cotton' });
      expect(items.at(-1)).not.toHaveProperty('path');
    }
  });

  it('emits only names and root-relative paths — no id, SEO field or media', () => {
    const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug: 'khan' });

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        item.path === undefined ? ['name'] : ['name', 'path'],
      );
      if (item.path !== undefined) expect(item.path.startsWith('/')).toBe(true);
    }
  });
});
