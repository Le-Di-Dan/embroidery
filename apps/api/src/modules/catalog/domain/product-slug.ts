/**
 * Server-owned product slug derivation (`APP2-B02-G01` / IMP-D032 §4.2).
 *
 * The client never supplies a slug and a rename never changes one: the slug is
 * a public address (`/api/public/products/{slug}` in B04), and silently
 * rewriting it would break every link that already pointed at the product.
 *
 * The `đ/Đ` fold must happen **before** NFD. Unicode does not decompose the
 * Vietnamese stroke into `d` + a combining mark, so a plain NFD pass followed by
 * mark-stripping would delete the letter entirely — `đỏ` would become `o`
 * rather than `do`.
 */

/** Used when a name normalizes to nothing at all (`!!!`, `---`, whitespace). */
export const EMPTY_SLUG_FALLBACK = 'san-pham';

/**
 * `products.slug` is `text`, so the **column** imposes no limit. The cap is
 * policy: it keeps a slug readable in a URL and far inside the B-tree entry
 * limit that `uq_products__slug` depends on.
 */
export const SLUG_MAX_LENGTH = 80;

/** Hex characters taken from the product id when the readable base collides. */
export const SLUG_SUFFIX_LENGTH = 8;

/**
 * Derives the readable base slug from a product name.
 *
 * Deterministic and side-effect free — the same name always produces the same
 * slug, so a retry cannot land on a different address than the first attempt.
 */
export function deriveProductSlugBase(name: string): string {
  const base = name
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base === '') {
    return EMPTY_SLUG_FALLBACK;
  }
  // Trim again after the cut: slicing mid-word can leave a trailing separator,
  // and `thu-bong-` is not a slug this policy ever emits.
  const capped = base.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '');
  return capped === '' ? EMPTY_SLUG_FALLBACK : capped;
}

/**
 * The single collision fallback: the readable base plus the first hex
 * characters of the product's own id.
 *
 * Derived from the id rather than a timestamp or a random value so the retry is
 * reproducible — the same product always produces the same fallback, which is
 * what makes a retried create converge instead of scattering addresses.
 */
export function deriveProductSlugFallback(base: string, productId: string): string {
  const compact = productId.replaceAll('-', '').toLowerCase();
  const suffix = compact.slice(0, SLUG_SUFFIX_LENGTH);
  const room = SLUG_MAX_LENGTH - suffix.length - 1;
  const trimmed = base.slice(0, Math.max(room, 0)).replace(/-+$/, '');
  return trimmed === '' ? `${EMPTY_SLUG_FALLBACK}-${suffix}` : `${trimmed}-${suffix}`;
}
