/**
 * Drizzle implementation of the public category inventory read (`APP12-C01`).
 *
 * ## Visibility is in the SQL, not above it
 *
 * `status = 'PUBLISHED'` and `archived_at IS NULL` are part of the statement. A
 * caller cannot forget them, and there is no code path that returns a draft or
 * archived category for a service to filter out later — the row never arrives.
 *
 * ## `is_indexable` is selected, never filtered on
 *
 * The single most important line in this file is the one that is *absent*: there
 * is no `eq(categories.isIndexable, true)`. Public visibility and sitemap
 * visibility are different questions (`public-category.policy.ts`), and a
 * `noindex` category must still reach a customer's filter row.
 *
 * The repository opens no transaction (DEC-DB7-006): this is an ordinary read,
 * and it is already a single consistent snapshot.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type {
  PublicCategoryRepository,
  PublicCategoryRow,
} from '../../domain/repositories/public-category.repository';
import { PUBLIC_CATEGORY_VISIBLE_STATE } from '../../domain/public-category.policy';

const { categories } = schema;

@Injectable()
export class DrizzlePublicCategoryRepository
  extends DrizzleRepository
  implements PublicCategoryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listPublic(limit: number): Promise<readonly PublicCategoryRow[]> {
    return this.run('listPublic', async () => {
      return (
        this.db
          .select({
            slug: categories.slug,
            name: categories.name,
            isIndexable: categories.isIndexable,
            displayOrder: categories.displayOrder,
          })
          .from(categories)
          .where(
            and(
              eq(categories.status, PUBLIC_CATEGORY_VISIBLE_STATE),
              isNull(categories.archivedAt),
            ),
          )
          // Total, and therefore stable: `display_order` is the editorial
          // authority and `slug` is globally unique (CST-011), so two categories
          // sharing a position still come back in the same order every time.
          .orderBy(asc(categories.displayOrder), asc(categories.slug))
          .limit(limit)
      );
    });
  }
}
