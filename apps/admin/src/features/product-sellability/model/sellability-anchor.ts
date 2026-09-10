/**
 * The in-page address of the sellability section.
 *
 * `APP12-N02.A01` adds **no route**: the section lives inside the existing
 * `/products/{productId}` editor, so "go to Phiên bản & SKU" is a fragment on
 * the page the operator is already on, not a navigation. The id is declared
 * once here because two components need it — the section renders it and the
 * structural warning links to it — and a literal repeated in both is how a
 * working link becomes a silent no-op after a rename.
 */
export const SELLABILITY_SECTION_ID = 'phien-ban-sku';

/** The `href` that scrolls to the section from elsewhere on the same page. */
export const SELLABILITY_SECTION_HREF = `#${SELLABILITY_SECTION_ID}`;
