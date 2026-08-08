/**
 * Server-owned Design Template slug derivation (`APP3-B03`).
 *
 * The client never supplies a slug. `design_templates.slug` is the public
 * listing identity `APP3-B05` will read by (`uq_design_templates__slug`,
 * CST-011), so letting a caller choose it would hand out a public address before
 * anything has decided the address is available.
 *
 * The algorithm is deliberately identical to the Catalog product rule
 * (`APP2-B02-G01` / IMP-D032 §4.2) including the `đ/Đ` fold **before** NFD:
 * Unicode does not decompose the Vietnamese stroke into `d` plus a combining
 * mark, so plain NFD followed by mark-stripping deletes the letter outright and
 * `đỏ` becomes `o` rather than `do`.
 *
 * It is restated here rather than imported because `product-slug.ts` is Catalog
 * **domain**, and a Design module reaching into it would be the cross-module
 * coupling `CLAUDE.md` §5 forbids. Promoting one shared slug policy to a
 * workspace package is a reasonable follow-up; doing it inside B03 would mean
 * editing accepted APP2 code for a checkpoint that owns no part of it.
 */

/** Used when a name normalizes to nothing at all (`!!!`, `---`, whitespace). */
export const EMPTY_TEMPLATE_SLUG_FALLBACK = 'mau-theu';

/**
 * `design_templates.slug` is `text`, so the **column** imposes no limit. The cap
 * is policy: it keeps the address readable and far inside the B-tree entry limit
 * `uq_design_templates__slug` depends on.
 */
export const TEMPLATE_SLUG_MAX_LENGTH = 80;

/** Hex characters taken from the template id when the readable base collides. */
export const TEMPLATE_SLUG_SUFFIX_LENGTH = 8;

/**
 * Derives the readable base slug from a Template name.
 *
 * Deterministic and side-effect free — the same name always produces the same
 * slug, so a retry cannot land on a different address than the first attempt.
 */
export function deriveTemplateSlugBase(name: string): string {
  const base = name
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base === '') {
    return EMPTY_TEMPLATE_SLUG_FALLBACK;
  }
  // Trim again after the cut: slicing mid-word can leave a trailing separator,
  // and `hoa-sen-` is not a slug this policy ever emits.
  const capped = base.slice(0, TEMPLATE_SLUG_MAX_LENGTH).replace(/-+$/, '');
  return capped === '' ? EMPTY_TEMPLATE_SLUG_FALLBACK : capped;
}

/**
 * The single collision fallback: the readable base plus the first hex characters
 * of the Template's own id.
 *
 * Derived from the id rather than a timestamp or a random value so a retried
 * create converges on one address instead of scattering them.
 */
export function deriveTemplateSlugFallback(base: string, templateId: string): string {
  const compact = templateId.replaceAll('-', '').toLowerCase();
  const suffix = compact.slice(0, TEMPLATE_SLUG_SUFFIX_LENGTH);
  const room = TEMPLATE_SLUG_MAX_LENGTH - suffix.length - 1;
  const trimmed = base.slice(0, Math.max(room, 0)).replace(/-+$/, '');
  return trimmed === '' ? `${EMPTY_TEMPLATE_SLUG_FALLBACK}-${suffix}` : `${trimmed}-${suffix}`;
}
