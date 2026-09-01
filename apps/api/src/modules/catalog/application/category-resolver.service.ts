/**
 * Resolves a `categorySlug` to the physical category row (IMP-D032, widened by
 * `APP12-C01`).
 *
 * The slug is the only category identity that crosses the wire, so this is the
 * one place it becomes a `category_id`. Two checks, in order: the slug must be
 * syntactically a slug, and the row must actually be active in the database.
 *
 * ## What changed at `APP12-C01`, and what did not
 *
 * The first check used to be membership of the closed four-value APP2 taxonomy.
 * That taxonomy was never a property of the store — `categories.slug` is an
 * unconstrained `text` column and the running database already holds a fifth
 * category — so the check has become a *shape* check, and the set of categories
 * is decided by rows alone. Nothing else moved: a slug naming no category, or
 * naming one that is not active, still fails, and still fails as
 * `PRODUCT_CATEGORY_INVALID`.
 *
 * The syntax check is kept rather than dropped in favour of the database lookup:
 * a malformed value must not reach a WHERE clause, and rejecting `AO THUN`
 * before a round trip is cheaper and narrower than letting the query decide.
 *
 * Both failures report the same `PRODUCT_CATEGORY_INVALID`, because the caller
 * can act on neither distinction and "this slug exists but is archived" is a
 * fact about the store's data that an error message need not volunteer.
 */
import { Inject, Injectable } from '@nestjs/common';
import { APP2_CATEGORY_STATUS } from '@embroidery/database';

import { isCategorySlug } from '../domain/category-slug';
import { productDraftError } from '../domain/product-draft.errors';
import {
  CATEGORY_REPOSITORY,
  type Category,
  type CategoryRepository,
} from '../domain/repositories/product.repository';

@Injectable()
export class CategoryResolver {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  /** The resolved category, or `PRODUCT_CATEGORY_INVALID`. */
  async requireBySlug(slug: string): Promise<Category> {
    if (!isCategorySlug(slug)) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    const category = await this.categories.findBySlug(slug);
    if (category === undefined || category.status !== APP2_CATEGORY_STATUS) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    return category;
  }
}
