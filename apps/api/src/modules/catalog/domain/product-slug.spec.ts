/**
 * The IMP-D032 slug policy, against the vectors `APP2-B02-G01` froze.
 *
 * These are the same inputs and outputs the gate locked in
 * `packages/database/src/schema/catalog-draft-categories.spec.ts`; that suite
 * proved the policy was implementable, this one proves the implementation
 * matches it.
 */
import {
  deriveProductSlugBase,
  deriveProductSlugFallback,
  EMPTY_SLUG_FALLBACK,
  SLUG_MAX_LENGTH,
} from './product-slug';

describe('product slug derivation', () => {
  it.each([
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
  ])('normalizes %p to %p', (input, expected) => {
    expect(deriveProductSlugBase(input)).toBe(expected);
  });

  it('folds the Vietnamese stroke before NFD, so đ survives as d', () => {
    // NFD does not decompose đ; stripping marks first would delete the letter.
    expect(deriveProductSlugBase('đỏ')).toBe('do');
    expect(deriveProductSlugBase('Đỏ')).toBe('do');
    expect(deriveProductSlugBase('đỏ')).not.toBe('o');
  });

  it('emits only lowercase ASCII kebab-case', () => {
    for (const input of ['Thú bông', 'ĐỒ CHƠI', 'Áo  --  Thun', 'Gấu bông ❤ 2026!']) {
      expect(deriveProductSlugBase(input)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('caps a long name without leaving a trailing separator', () => {
    const slug = deriveProductSlugBase('Thú bông siêu dễ thương '.repeat(20));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).not.toMatch(/-$/);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('is deterministic', () => {
    expect(deriveProductSlugBase('Thú bông')).toBe(deriveProductSlugBase('Thú bông'));
  });
});

describe('product slug collision fallback', () => {
  const productId = '019a1234-5678-7abc-8def-0123456789ab';

  it('appends the first eight hex characters of the compact product id', () => {
    expect(deriveProductSlugFallback('thu-bong', productId)).toBe('thu-bong-019a1234');
  });

  it('derives from the id, never from time or randomness', () => {
    const first = deriveProductSlugFallback('thu-bong', productId);
    const second = deriveProductSlugFallback('thu-bong', productId);
    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{13}/);
  });

  it('keeps the fallback inside the cap by trimming the base, not the suffix', () => {
    const long = deriveProductSlugBase('Thú bông siêu dễ thương '.repeat(20));
    const fallback = deriveProductSlugFallback(long, productId);
    expect(fallback.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(fallback.endsWith('-019a1234')).toBe(true);
    expect(fallback).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('still produces a usable slug when the base was the empty fallback', () => {
    expect(deriveProductSlugFallback(EMPTY_SLUG_FALLBACK, productId)).toBe(
      `${EMPTY_SLUG_FALLBACK}-019a1234`,
    );
  });
});
