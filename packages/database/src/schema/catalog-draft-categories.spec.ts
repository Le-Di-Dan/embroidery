/**
 * APP2-B02-G01 — the locked product-draft required-field decisions (IMP-D032).
 *
 * These are contract tests, not implementation tests: `APP2-B02` owns the
 * product service and the slug function. What is frozen here is everything that
 * service must satisfy — the exact taxonomy, the draft sentinels, the media
 * role rule, and an input→output vector table for the slug policy.
 *
 * The slug section carries a **reference implementation owned by this spec**.
 * It exists to prove the written policy is unambiguous and actually produces
 * the frozen outputs; production ownership stays with the future Catalog
 * capability, which must reproduce the same table.
 */
import {
  APP2_CATEGORY_SLUGS,
  APP2_CATEGORY_STATUS,
  APP2_CATEGORY_TAXONOMY,
  CATEGORY_STATES,
} from './catalog/categories';
import {
  PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
  PRODUCT_DRAFT_DISPLAY_ORDER,
  PRODUCT_STATES,
} from './catalog/products';
import {
  APP2_PRODUCT_MEDIA_ROLES,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_ROLES,
  PRODUCT_MEDIA_SECONDARY_ROLE,
} from './catalog/product-media';

describe('APP2 category taxonomy', () => {
  it('is exactly the four locked categories, in canonical order', () => {
    expect(APP2_CATEGORY_TAXONOMY.map((c) => [c.slug, c.name, c.displayOrder])).toEqual([
      ['thu-bong', 'Thú bông', 10],
      ['khan', 'Khăn', 20],
      ['quan-ao', 'Quần áo', 30],
      ['khac', 'Khác', 90],
    ]);
  });

  it('introduces no fifth category', () => {
    expect(APP2_CATEGORY_TAXONOMY).toHaveLength(4);
    expect(APP2_CATEGORY_SLUGS).toHaveLength(4);
  });

  it('exposes the slug list in the same order as the taxonomy', () => {
    expect([...APP2_CATEGORY_SLUGS]).toEqual(APP2_CATEGORY_TAXONOMY.map((c) => c.slug));
  });

  it('has no duplicate id, slug, name or display order', () => {
    for (const key of ['id', 'slug', 'name', 'displayOrder'] as const) {
      const values = APP2_CATEGORY_TAXONOMY.map((c) => c[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('uses deterministic UUIDv7-shaped ids, never a generated value', () => {
    for (const category of APP2_CATEGORY_TAXONOMY) {
      expect(category.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('uses ASCII kebab-case slugs so they are stable URL and wire keys', () => {
    for (const { slug } of APP2_CATEGORY_TAXONOMY) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('maps "active" onto a real literal of the existing status set', () => {
    expect(APP2_CATEGORY_STATUS).toBe('PUBLISHED');
    expect(CATEGORY_STATES).toContain(APP2_CATEGORY_STATUS);
  });
});

describe('product draft sentinels', () => {
  it('creates drafts with an explicit unset price, not a sale price', () => {
    expect(PRODUCT_DRAFT_BASE_PRICE_AMOUNT).toBe('0');
    // Money never becomes a JavaScript number (CLAUDE.md §5).
    expect(typeof PRODUCT_DRAFT_BASE_PRICE_AMOUNT).toBe('string');
  });

  it('creates drafts with no curated public order', () => {
    expect(PRODUCT_DRAFT_DISPLAY_ORDER).toBe(0);
  });

  it('creates in the canonical DRAFT state', () => {
    expect(PRODUCT_STATES[0]).toBe('DRAFT');
  });
});

describe('product media role rule', () => {
  it('assigns the first Asset THUMBNAIL and the rest GALLERY', () => {
    expect(PRODUCT_MEDIA_PRIMARY_ROLE).toBe('THUMBNAIL');
    expect(PRODUCT_MEDIA_SECONDARY_ROLE).toBe('GALLERY');
  });

  it('excludes DETAIL from APP2-B02 while leaving the database set intact', () => {
    expect([...APP2_PRODUCT_MEDIA_ROLES]).toEqual(['THUMBNAIL', 'GALLERY']);
    expect(APP2_PRODUCT_MEDIA_ROLES).not.toContain('DETAIL');
    // The physical closed set is unchanged — B02 simply never writes DETAIL.
    expect([...PRODUCT_MEDIA_ROLES]).toEqual(['GALLERY', 'THUMBNAIL', 'DETAIL']);
  });

  it('keeps every role it writes inside the closed database set', () => {
    for (const role of APP2_PRODUCT_MEDIA_ROLES) {
      expect(PRODUCT_MEDIA_ROLES).toContain(role);
    }
  });
});

/**
 * Reference implementation of the IMP-D032 slug policy, owned by this spec.
 * Steps are numbered to match the decision record.
 */
const EMPTY_SLUG_FALLBACK = 'san-pham';
/**
 * `products.slug` is `text` — the column imposes no limit — so the policy caps
 * the base itself. 80 keeps a slug readable in a URL and far inside the B-tree
 * entry limit that `uq_products__slug` depends on.
 */
const SLUG_MAX_LENGTH = 80;

function referenceSlug(name: string): string {
  const base = name
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D') // 2 — NFD does not decompose the Vietnamese stroke
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '') // 3 — drop combining marks
    .toLowerCase() // 4
    .replaceAll(/[^a-z0-9]+/g, '-') // 5
    .replace(/^-+|-+$/g, ''); // 6
  if (base === '') {
    return EMPTY_SLUG_FALLBACK; // 7
  }
  return base.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, ''); // 8
}

/** Frozen input → base-slug vectors the B02 implementation must reproduce. */
const SLUG_VECTORS: readonly (readonly [string, string])[] = [
  ['Thú bông', 'thu-bong'],
  ['Khăn tắm', 'khan-tam'],
  ['Quần áo', 'quan-ao'],
  ['Áo dài đỏ', 'ao-dai-do'],
  ['ĐỒ CHƠI', 'do-choi'],
  ['Gấu bông ❤ 2026!', 'gau-bong-2026'],
  ['Khăn   tắm  ', 'khan-tam'],
  ['Áo  --  Thun', 'ao-thun'],
  ['---', EMPTY_SLUG_FALLBACK],
  ['!!!', EMPTY_SLUG_FALLBACK],
  ['   ', EMPTY_SLUG_FALLBACK],
  ['', EMPTY_SLUG_FALLBACK],
];

describe('product slug policy', () => {
  it.each(SLUG_VECTORS)('normalizes %p to %p', (input, expected) => {
    expect(referenceSlug(input)).toBe(expected);
  });

  it('produces only lowercase ASCII kebab-case, never a bare or doubled dash', () => {
    for (const [input] of SLUG_VECTORS) {
      const slug = referenceSlug(input);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('caps a long name and never leaves a trailing dash at the cut', () => {
    const long = `${'Thú bông siêu dễ thương '.repeat(20)}`;
    const slug = referenceSlug(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).not.toMatch(/-$/);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('is deterministic — the same name always yields the same slug', () => {
    for (const [input, expected] of SLUG_VECTORS) {
      expect(referenceSlug(input)).toBe(referenceSlug(input));
      expect(referenceSlug(input)).toBe(expected);
    }
  });

  it('derives the collision fallback from the product id, never from time or randomness', () => {
    const productId = '019a1234-5678-7abc-8def-0123456789ab';
    const suffix = productId.replaceAll('-', '').slice(0, 8);
    const fallback = `${referenceSlug('Thú bông')}-${suffix}`;

    expect(suffix).toBe('019a1234');
    expect(fallback).toBe('thu-bong-019a1234');
    expect(fallback).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$/);
  });
});
