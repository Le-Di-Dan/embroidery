/**
 * @jest-environment node
 *
 * The Product Detail breadcrumb trail (`APP11-S04-C1`, corrected by
 * `APP12-C01-C1`).
 *
 * ## The two defects this file has now outlived
 *
 * `APP11-S04` linked the category crumb unconditionally, trusting a contract
 * that declared a closed four-value category enum the running API did not
 * honour — so a Product in `ao-thun` advertised, in structured data, a URL
 * Discover answered with its not-found boundary.
 *
 * `S04-C1` contained that by dropping the crumb whenever the slug was outside
 * those four. That traded one wrong answer for another: a category the operator
 * publishes today would lose its crumb until someone edited source.
 *
 * `APP12-C01-C1` removed the cause. The category set is the `categories` table,
 * Discover lists from it, and a Product is publicly visible only when its
 * category is published and not archived — the public read enforces that in
 * SQL. So a category reaching the breadcrumb is one `/kham-pha?category=` will
 * render, and the remaining guard is on slug **syntax** — a URL rule this app
 * owns — never on membership of a list.
 *
 * What this file pins is that no compiled taxonomy has crept back in: the slugs
 * below are arbitrary fixture values, deliberately not the four migration `0033`
 * seeded.
 */
import { buildDiscoverHref, DISCOVER_ROUTE } from '../../src/features/product-discovery';
import { resolveProductBreadcrumb } from '../../src/features/product-detail';

const PRODUCT = { name: 'Áo thun cotton', categoryName: 'Áo thun', categorySlug: 'ao-thun' };

/**
 * Arbitrary valid category slugs — fixture data, not a taxonomy.
 *
 * None is a category any build knows about, which is the point: the crumb must
 * resolve for them exactly as it would for any other row.
 */
const ARBITRARY_SLUGS = ['ao-thun', 'mu-luoi-trai', 'tui-vai', 'danh-muc-2026'];

describe('a Product in any database-backed category', () => {
  it.each(ARBITRARY_SLUGS)('resolves three levels for %s, with no membership check', (slug) => {
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

  it('resolves the crumb for a category no build could have known', () => {
    // The exact case `APP11-S04-C1` had to drop. It is now an ordinary crumb.
    const items = resolveProductBreadcrumb(PRODUCT);

    expect(items).toHaveLength(3);
    expect(items[1]).toEqual({ name: 'Áo thun', path: '/kham-pha?category=ao-thun' });
  });

  it('labels the crumb from the API-supplied name, never from the slug', () => {
    // Renaming a category in the database renames the crumb, with no deployment
    // and with the URL unchanged.
    const items = resolveProductBreadcrumb({ ...PRODUCT, categoryName: 'Áo thun cao cấp' });

    expect(items[1]?.name).toBe('Áo thun cao cấp');
    expect(items[1]?.path).toBe('/kham-pha?category=ao-thun');
  });

  it('builds the category href through the one Discover builder', () => {
    // Never a literal: the crumb, the Discover chips and the sitemap's category
    // URLs are composed by one function and cannot disagree about how a
    // category is addressed.
    const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug: 'mu-luoi-trai' });

    expect(items[1]?.path).toBe(buildDiscoverHref('mu-luoi-trai'));
    expect(items[1]?.path).toBe('/kham-pha?category=mu-luoi-trai');
  });
});

describe('a Product whose category data cannot become a URL', () => {
  it.each(['', 'THU-BONG', 'thu bong', 'ao_thun', '-ao', 'ao--thun'])(
    'drops the crumb for the malformed slug %s rather than advertising it',
    (categorySlug) => {
      const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug });

      expect(items).toHaveLength(2);
      expect(JSON.stringify(items)).not.toContain('category=');
    },
  );

  it('drops the crumb when the category has no name to render', () => {
    const items = resolveProductBreadcrumb({ ...PRODUCT, categoryName: '' });

    expect(items).toEqual([{ name: 'Khám phá', path: DISCOVER_ROUTE }, { name: 'Áo thun cotton' }]);
  });

  it('invents no mapping onto some other category', () => {
    // A malformed slug is dropped, never rewritten. No repository authority
    // defines such a mapping, and inventing one here would be this module
    // deciding what the catalogue means.
    const serialized = JSON.stringify(
      resolveProductBreadcrumb({ ...PRODUCT, categorySlug: 'thu bong' }),
    );

    for (const slug of [...ARBITRARY_SLUGS, 'thu-bong', 'quan-ao', 'khan', 'khac']) {
      expect(serialized).not.toContain(slug);
    }
  });

  it('still names Khám phá, which really is where the Product was reached from', () => {
    const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug: '' });

    expect(items[0]).toEqual({ name: 'Khám phá', path: DISCOVER_ROUTE });
  });
});

describe('the shape both consumers depend on', () => {
  it('gives the current Product a name and no path, in either branch', () => {
    // The last item is never a link — the same reason the visible crumb is text
    // and the JSON-LD item carries no `item` URL.
    for (const categorySlug of ['mu-luoi-trai', 'khong hop le']) {
      const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug });

      expect(items.at(-1)).toEqual({ name: 'Áo thun cotton' });
      expect(items.at(-1)).not.toHaveProperty('path');
    }
  });

  it('emits only names and root-relative paths — no id, SEO field or media', () => {
    const items = resolveProductBreadcrumb({ ...PRODUCT, categorySlug: 'mu-luoi-trai' });

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        item.path === undefined ? ['name'] : ['name', 'path'],
      );
      if (item.path !== undefined) expect(item.path.startsWith('/')).toBe(true);
    }
  });
});
