/**
 * The one public category inventory query (`APP12-C01`).
 *
 * Orchestration only: ask the read port, check the safety cap, project. There is
 * no transaction, no lock, no cache and no write — the invariant that
 * publishing, archiving or re-ordering a category takes effect on the next read
 * is satisfied by there being nothing between the caller and the rows.
 *
 * ## It owns no visibility rule of its own
 *
 * `status = 'PUBLISHED' AND archived_at IS NULL` lives in the repository's SQL,
 * where a caller cannot forget it. This service never re-states it, so there is
 * no second definition of "public category" in the process to drift from the
 * first (`BACKEND_CONVENTIONS.md` §10).
 *
 * ## Ordering is the database's, not this file's
 *
 * The rows arrive in `(display_order, slug)` order from an ORDER BY, and are
 * concatenated unchanged. Sorting again here would be a second ordering
 * authority — and the one that would quietly win.
 */
import { Inject, Injectable } from '@nestjs/common';

import { publicCategoryInventoryTooLarge } from '../domain/public-category.errors';
import { PUBLIC_CATEGORY_MAX_ENTRIES } from '../domain/public-category.policy';
import {
  PUBLIC_CATEGORY_REPOSITORY,
  type PublicCategoryRepository,
} from '../domain/repositories/public-category.repository';
import { toPublicCategory, type PublicCategoryListView } from './public-category.projection';

/**
 * One above the cap.
 *
 * The extra row is what makes "the taxonomy is larger than one response may
 * carry" observable at all: fetching exactly the cap would return a full page
 * that is indistinguishable from a complete inventory of exactly that size.
 */
const FETCH_LIMIT = PUBLIC_CATEGORY_MAX_ENTRIES + 1;

@Injectable()
export class PublicCategoryQuery {
  constructor(
    @Inject(PUBLIC_CATEGORY_REPOSITORY) private readonly categories: PublicCategoryRepository,
  ) {}

  async list(): Promise<PublicCategoryListView> {
    const rows = await this.categories.listPublic(FETCH_LIMIT);

    // Checked before anything is projected: the response is either the whole
    // taxonomy or no response at all.
    if (rows.length > PUBLIC_CATEGORY_MAX_ENTRIES) {
      throw publicCategoryInventoryTooLarge();
    }

    return { items: rows.map(toPublicCategory) };
  }
}
