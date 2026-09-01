/**
 * Drizzle implementation of the Admin category management contract
 * (`APP12-C02`).
 *
 * The repository opens no transaction of its own (DEC-DB7-006); the use cases
 * own that through `TransactionManager`, and the two methods that depend on a
 * transaction refuse outright when none is active.
 *
 * Two things are worth reading closely: the list is **one** statement whatever
 * the taxonomy's size, and the concurrency token is computed by the database
 * rather than by this process.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, schema } from '@embroidery/database';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import {
  CATEGORY_INITIAL_STATE,
  CATEGORY_PUBLISHED_STATE,
} from '../../domain/admin-category.policy';
import type {
  AdminCategory,
  AdminCategoryListEntry,
  AdminCategoryRepository,
  CreateCategoryInput,
  TransitionCategoryInput,
  UpdateCategoryInput,
} from '../../domain/repositories/admin-category.repository';
import type { CategoryId } from '../../domain/repositories/product.repository';

const { categories, products } = schema;

/** Every column the Admin surface publishes. */
const SELECTION = {
  id: categories.id,
  slug: categories.slug,
  name: categories.name,
  status: categories.status,
  isIndexable: categories.isIndexable,
  displayOrder: categories.displayOrder,
  archivedAt: categories.archivedAt,
  updatedAt: categories.updatedAt,
} as const;

/** The row shape {@link SELECTION} returns, before it becomes a domain object. */
interface SelectedRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
}

/**
 * The concurrency guard, compared at millisecond precision.
 *
 * The same mechanism `product-concurrency-token.ts` documents in full, restated
 * for the category column rather than imported: that module is bound to
 * `products.updated_at` by construction. `timestamptz` keeps microseconds while
 * the published token is an ISO string with milliseconds, so a caller can only
 * ever echo a truncated value — truncating both sides compares exactly what the
 * client was given.
 */
function updatedAtMatches(expected: Date) {
  return eq(sql`date_trunc('milliseconds', ${categories.updatedAt})`, expected);
}

/**
 * The next token — **strictly greater** than the current one, computed by the
 * database inside the same statement.
 *
 * `clock_timestamp()` rather than `now()`, which is fixed for a whole
 * transaction and would let two writes in one transaction tie. Application time
 * is never the authority: a skewed API host must not be able to issue a token
 * that moves backwards.
 */
function nextUpdatedAt() {
  return sql`greatest(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', ${categories.updatedAt}) + interval '1 millisecond'
  )`;
}

function toAdminCategory(row: SelectedRow): AdminCategory {
  return {
    id: row.id as CategoryId,
    slug: row.slug,
    name: row.name,
    status: row.status as AdminCategory['status'],
    isIndexable: row.isIndexable,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ?? undefined,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class DrizzleAdminCategoryRepository
  extends DrizzleRepository
  implements AdminCategoryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * The whole taxonomy with its dependency counts, in one statement.
   *
   * A `LEFT JOIN` narrowed to published Products plus `GROUP BY categories.id`
   * — not a correlated subquery in the select list, whose columns Drizzle
   * unqualifies (the defect `APP11-B03` hit), and not a second query per row.
   * The status filter rides in the join predicate rather than a `WHERE`, so a
   * category with no published Product still appears, with a count of zero.
   */
  async list(limit: number): Promise<readonly AdminCategoryListEntry[]> {
    return this.run('list', async () => {
      const rows = await this.db
        .select({
          ...SELECTION,
          publishedProductCount: sql<number>`count(${products.id})::int`,
        })
        .from(categories)
        .leftJoin(
          products,
          and(
            eq(products.categoryId, categories.id),
            eq(products.status, CATEGORY_PUBLISHED_STATE),
          ),
        )
        .groupBy(categories.id)
        .orderBy(asc(categories.displayOrder), asc(categories.slug))
        .limit(limit);

      return rows.map((row) => ({
        ...toAdminCategory(row),
        publishedProductCount: row.publishedProductCount,
      }));
    });
  }

  async create(input: CreateCategoryInput): Promise<AdminCategory> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(categories)
        .values({
          id: input.id,
          slug: input.slug,
          name: input.name,
          // Server-owned. A client never chooses the initial state, and a new
          // category is never born archived.
          status: CATEGORY_INITIAL_STATE,
          archivedAt: null,
          isIndexable: input.isIndexable,
          displayOrder: input.displayOrder,
        })
        .returning(SELECTION);

      if (row === undefined) {
        throw guardViolationError(
          'AdminCategoryRepository.create',
          'CATEGORY_NOT_CREATED',
          'Could not create the category.',
        );
      }
      return toAdminCategory(row);
    });
  }

  async lockById(id: CategoryId): Promise<AdminCategory | undefined> {
    return this.run('lockById', async () => {
      const tx = this.requireTransaction('lockById');
      const [row] = await tx
        .select(SELECTION)
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toAdminCategory(row);
    });
  }

  async slugTakenByOther(slug: string, exceptId: CategoryId | undefined): Promise<boolean> {
    return this.run('slugTakenByOther', async () => {
      const predicate =
        exceptId === undefined
          ? eq(categories.slug, slug)
          : and(eq(categories.slug, slug), ne(categories.id, exceptId));
      const [row] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(predicate)
        .limit(1);
      return row !== undefined;
    });
  }

  async countPublishedProducts(id: CategoryId): Promise<number> {
    return this.run('countPublishedProducts', async () => {
      this.requireTransaction('countPublishedProducts');
      const [row] = await this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(products)
        .where(and(eq(products.categoryId, id), eq(products.status, CATEGORY_PUBLISHED_STATE)));
      return row?.total ?? 0;
    });
  }

  async updateGuarded(input: UpdateCategoryInput): Promise<AdminCategory | undefined> {
    return this.run('updateGuarded', async () => {
      // Built from present keys only, so an absent field is left alone rather
      // than overwritten with `undefined`.
      const assignments = {
        ...(input.fields.slug === undefined ? {} : { slug: input.fields.slug }),
        ...(input.fields.name === undefined ? {} : { name: input.fields.name }),
        ...(input.fields.isIndexable === undefined
          ? {}
          : { isIndexable: input.fields.isIndexable }),
        ...(input.fields.displayOrder === undefined
          ? {}
          : { displayOrder: input.fields.displayOrder }),
      };

      const [row] = await this.db
        .update(categories)
        // `status` and `archived_at` are deliberately absent: a patch may never
        // move a row through the lifecycle.
        .set({ ...assignments, updatedAt: nextUpdatedAt() })
        .where(and(eq(categories.id, input.id), updatedAtMatches(input.expectedUpdatedAt)))
        .returning(SELECTION);

      return row === undefined ? undefined : toAdminCategory(row);
    });
  }

  async transitionGuarded(input: TransitionCategoryInput): Promise<AdminCategory | undefined> {
    return this.run('transitionGuarded', async () => {
      const [row] = await this.db
        .update(categories)
        .set({
          status: input.toState,
          // Written only by an archive; a publish carries `undefined` and
          // therefore never clears an archive fact it did not create.
          ...(input.archivedAt === undefined ? {} : { archivedAt: input.archivedAt }),
          updatedAt: nextUpdatedAt(),
        })
        .where(
          and(
            eq(categories.id, input.id),
            eq(categories.status, input.fromState),
            updatedAtMatches(input.expectedUpdatedAt),
          ),
        )
        .returning(SELECTION);

      return row === undefined ? undefined : toAdminCategory(row);
    });
  }
}
