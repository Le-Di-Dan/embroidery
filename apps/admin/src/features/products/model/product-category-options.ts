/**
 * The editable category options.
 *
 * The taxonomy is closed and fixed (IMP-D032) and there is no category
 * endpoint, so the options are derived from the generated contract enum rather
 * than typed out. Adding a category to the contract therefore surfaces here as
 * a build error instead of a silently missing option.
 *
 * The physical category UUID is not in the contract and is never rendered,
 * submitted or logged — the slug is the only category identity the client
 * handles.
 */
import { AdminProductListCategorySlug } from '@embroidery/api-client';

import { productCategoryLabel, parseProductCategory } from './product-category';

export type ProductCategorySlug =
  (typeof AdminProductListCategorySlug)[keyof typeof AdminProductListCategorySlug];

/** The four contract slugs, in the approved presentation order. */
export const PRODUCT_CATEGORY_SLUGS: readonly ProductCategorySlug[] = [
  AdminProductListCategorySlug['thu-bong'],
  AdminProductListCategorySlug.khan,
  AdminProductListCategorySlug['quan-ao'],
  AdminProductListCategorySlug.khac,
];

export interface ProductCategoryOption {
  readonly slug: ProductCategorySlug;
  readonly label: string;
}

/** Reuses the list's label mapping so both screens spell a category once. */
export const PRODUCT_CATEGORY_OPTIONS: readonly ProductCategoryOption[] =
  PRODUCT_CATEGORY_SLUGS.map((slug) => ({
    slug,
    label: productCategoryLabel(parseProductCategory(slug)),
  }));
