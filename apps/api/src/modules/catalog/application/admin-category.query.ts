/**
 * The Admin category inventory read (`APP12-C02`).
 *
 * Orchestration only: ask the port, check the safety cap, project. No
 * transaction, no lock, no cache — a category the operator just published must
 * be in the very next response, and the way to guarantee that is to have
 * nothing between the caller and the rows.
 *
 * ## It owns no ordering and no filter
 *
 * The rows arrive in `(display_order, slug)` order from an `ORDER BY` and are
 * concatenated unchanged; sorting again here would be a second ordering
 * authority, and the one that would quietly win. There is no status filter
 * either: the operator's list is the *whole* taxonomy — drafts they have not
 * published yet and archived rows whose Products still exist — and a screen that
 * wants a subset has every row's `status` to work from.
 *
 * ## Why this becomes the Admin's category authority
 *
 * `APP12-C01-C1` pointed the Admin Product form and filter at
 * `publicCategory_list`, because no `DRAFT` or `ARCHIVED` category was reachable
 * — nothing in the application could create one. `APP12-C02` makes both states
 * reachable, so this operation is now the canonical Admin inventory, and
 * `APP12-A01` moves the Product screens onto it. The public read remains
 * correct for what it answers: which categories a *customer* may browse.
 */
import { Inject, Injectable } from '@nestjs/common';

import { adminCategoryError } from '../domain/admin-category.errors';
import { ADMIN_CATEGORY_MAX_ENTRIES } from '../domain/admin-category.policy';
import {
  ADMIN_CATEGORY_REPOSITORY,
  type AdminCategoryRepository,
} from '../domain/repositories/admin-category.repository';
import { toAdminCategoryListItem, type AdminCategoryListView } from './admin-category.projection';

/**
 * One above the cap.
 *
 * The extra row is what makes "the taxonomy is larger than one response may
 * carry" observable at all: fetching exactly the cap returns a full page that is
 * indistinguishable from a complete inventory of exactly that size.
 */
const FETCH_LIMIT = ADMIN_CATEGORY_MAX_ENTRIES + 1;

@Injectable()
export class AdminCategoryQuery {
  constructor(
    @Inject(ADMIN_CATEGORY_REPOSITORY) private readonly categories: AdminCategoryRepository,
  ) {}

  async list(): Promise<AdminCategoryListView> {
    const rows = await this.categories.list(FETCH_LIMIT);

    // Checked before anything is projected: the response is either the whole
    // taxonomy or no response at all.
    if (rows.length > ADMIN_CATEGORY_MAX_ENTRIES) {
      throw adminCategoryError('CATEGORY_INVENTORY_TOO_LARGE');
    }

    return { items: rows.map(toAdminCategoryListItem) };
  }
}
