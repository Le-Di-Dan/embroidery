/**
 * Resolves a `categorySlug` to the physical category row (IMP-D032, widened by
 * `APP12-C01`, split by `APP12-C02`).
 *
 * The slug is the only category identity that crosses the wire, so this is the
 * one place it becomes a `category_id`. Two checks, in order: the slug must be
 * syntactically a slug, and the row must actually exist.
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
 * ## Why `APP12-C02` split one method into two
 *
 * Until C02 there was exactly one category state a running application could
 * produce: `PUBLISHED`. Both callers therefore wanted the same thing and one
 * method served them. C02 makes `DRAFT` and `ARCHIVED` operator-reachable, and
 * at that moment the two callers stop agreeing:
 *
 * - **A write** must still refuse anything but `PUBLISHED` — filing a product
 *   under a draft or a withdrawn category is exactly the state publication would
 *   later have to repair — and it must hold the row still until it commits.
 * - **A read filter** must accept *any* state that exists. The products left
 *   behind under a category the operator archived are the ones an operator most
 *   needs to find, and a 400 on their own filter would make them unreachable.
 *
 * Both failures still report `PRODUCT_CATEGORY_INVALID`: the caller can act on
 * no finer distinction, and "this slug exists but is archived" is a fact about
 * the store's data that an error message need not volunteer.
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

  /**
   * The category a Product may be **written** into: it exists and is active.
   *
   * The row is read under a `FOR SHARE` lock, so the category cannot be archived
   * between this check and the caller's commit — the archive transition takes
   * the same row `FOR UPDATE` and one of the two waits. Without the lock this
   * would be a check-then-write, and the window is precisely the one
   * `APP12-C02` §15 requires closed.
   *
   * @requiresTransaction
   */
  async requireActiveBySlug(slug: string): Promise<Category> {
    const category = await this.resolve(slug, (value) => this.categories.lockBySlug(value));
    if (category.status !== APP2_CATEGORY_STATUS) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    return category;
  }

  /**
   * The category an Admin **read filter** names: it exists, in any state.
   *
   * No lock and no state check. A filter does not write, so it has nothing to
   * hold still, and narrowing it to published categories would hide the
   * products an operator archived a category out from under.
   */
  async requireAnyBySlug(slug: string): Promise<Category> {
    return this.resolve(slug, (value) => this.categories.findBySlug(value));
  }

  /** Syntax, then existence — the two checks both callers share, in that order. */
  private async resolve(
    slug: string,
    lookup: (slug: string) => Promise<Category | undefined>,
  ): Promise<Category> {
    if (!isCategorySlug(slug)) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    const category = await lookup(slug);
    if (category === undefined) {
      throw productDraftError('PRODUCT_CATEGORY_INVALID');
    }
    return category;
  }
}
