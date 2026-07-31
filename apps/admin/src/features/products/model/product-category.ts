/**
 * Product category presentation.
 *
 * The taxonomy is closed and fixed (IMP-D032): there are exactly four
 * categories, there is no category endpoint, and the Admin database package is
 * never imported by a browser bundle. So the label mapping lives here, keyed by
 * the generated category-slug enum — adding a category to the contract fails
 * the build rather than rendering an unmapped value.
 *
 * The response also carries a server-side `name`. It is deliberately not
 * rendered: one screen, one spelling, and an unrecognised server string never
 * reaches the DOM. The category UUID is not in the contract and is never shown.
 *
 * Copy is the approved mapping (`498:272` — Bộ lọc danh mục).
 */
import { AdminProductListCategorySlug } from '@embroidery/api-client';

import { PRODUCT_COPY } from './product-copy';

/** The four contract slugs, plus the safe fallback for anything else. */
export type ProductCategoryPresentation =
  (typeof AdminProductListCategorySlug)[keyof typeof AdminProductListCategorySlug] | 'UNKNOWN';

const LABEL: Readonly<Record<ProductCategoryPresentation, string>> = {
  [AdminProductListCategorySlug['thu-bong']]: PRODUCT_COPY.category.thuBong,
  [AdminProductListCategorySlug.khan]: PRODUCT_COPY.category.khan,
  [AdminProductListCategorySlug['quan-ao']]: PRODUCT_COPY.category.quanAo,
  [AdminProductListCategorySlug.khac]: PRODUCT_COPY.category.khac,
  UNKNOWN: PRODUCT_COPY.category.unknown,
};

/** Maps a wire slug to presentation. Unknown input fails safely. */
export function parseProductCategory(slug: unknown): ProductCategoryPresentation {
  if (typeof slug !== 'string' || !(slug in LABEL) || slug === 'UNKNOWN') {
    return 'UNKNOWN';
  }
  return slug as ProductCategoryPresentation;
}

/** The approved Vietnamese label for a category presentation. */
export function productCategoryLabel(presentation: ProductCategoryPresentation): string {
  return LABEL[presentation];
}
