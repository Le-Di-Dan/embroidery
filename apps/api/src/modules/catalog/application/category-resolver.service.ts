/**
 * Resolves a locked `categorySlug` to the physical category row (IMP-D032).
 *
 * The slug is the only category identity that crosses the wire, so this is the
 * one place it becomes a `category_id`. Two checks, in order: the slug must be
 * a member of the closed APP2 taxonomy, and the row must actually be active in
 * the database. Trusting the enum alone would let a request through against a
 * database whose provisioning migration had not run; trusting the row alone
 * would let any category the taxonomy does not name be filed against.
 *
 * Both failures report the same `PRODUCT_CATEGORY_INVALID`, because the caller
 * can act on neither distinction and "this slug exists but is archived" is a
 * fact about the store's data that an error message need not volunteer.
 */
import { Inject, Injectable } from '@nestjs/common';
import { APP2_CATEGORY_SLUGS, APP2_CATEGORY_STATUS } from '@embroidery/database';

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
    if (!(APP2_CATEGORY_SLUGS as readonly string[]).includes(slug)) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    const category = await this.categories.findBySlug(slug);
    if (category === undefined || category.status !== APP2_CATEGORY_STATUS) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    return category;
  }
}
