/**
 * Drizzle implementation of the Admin product-draft contract (`APP2-B02`).
 *
 * Every mutation is a single guarded statement: the WHERE clause carries the
 * identity, the allowed source states and the exact `updated_at` the caller
 * read. A read-then-write would leave a window in which another request commits
 * between the check and the write, and the guard would have proved nothing.
 *
 * The repository opens no transaction of its own (DEC-DB7-006) — the use case
 * owns that through `TransactionManager`, and the executor resolves the active
 * handle.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, newId, schema } from '@embroidery/database';
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import type {
  ArchiveProductDraftInput,
  CreateProductDraftInput,
  GuardedWriteResult,
  ProductDraft,
  ProductDraftId,
  ProductDraftListQuery,
  ProductDraftMedia,
  ProductDraftMediaLink,
  ProductDraftRepository,
  UpdateProductDraftInput,
} from '../../domain/repositories/product-draft.repository';
import {
  PRODUCT_ARCHIVED_STATE,
  PRODUCT_CURRENCY,
  PRODUCT_DRAFT_STATE,
} from '../../domain/product-draft.policy';
import { nextUpdatedAt, updatedAtMatches } from './product-concurrency-token';
import {
  toProductDraft,
  toProductDraftMedia,
  type ProductDraftJoinedRow,
} from './product-draft-row.mapper';

const { products, categories, productMedia, assets } = schema;

@Injectable()
export class DrizzleProductDraftRepository
  extends DrizzleRepository
  implements ProductDraftRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Product columns plus the category slug the Admin surface addresses by and
   * the category name it displays.
   *
   * The name comes from the joined row because the `categories` table is the
   * only category authority (`APP12-C01-C1`). The join already existed for the
   * slug, so reading the name beside it costs nothing and removes the compiled
   * label map that could not name a category added after the build.
   */
  private selection() {
    return {
      id: products.id,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      categoryName: categories.name,
      name: products.name,
      slug: products.slug,
      description: products.description,
      basePriceAmount: products.basePriceAmount,
      currencyCode: products.currencyCode,
      status: products.status,
      displayOrder: products.displayOrder,
      archivedAt: products.archivedAt,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    };
  }

  async create(input: CreateProductDraftInput): Promise<ProductDraft> {
    return this.run('create', async () => {
      const [inserted] = await this.db
        .insert(products)
        .values({
          id: input.id,
          categoryId: input.categoryId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          basePriceAmount: input.basePriceAmount,
          currencyCode: PRODUCT_CURRENCY,
          status: PRODUCT_DRAFT_STATE,
          isDisplayOutOfStock: false,
          displayOrder: input.displayOrder,
          isIndexable: true,
          // Database time, truncated to the precision the public token carries.
          // The column default is microsecond, which no client can echo back;
          // application time is never the authority for a concurrency token.
          createdAt: sql`date_trunc('milliseconds', clock_timestamp())`,
          updatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        })
        .returning({ id: products.id });

      if (inserted === undefined) {
        throw guardViolationError(
          'ProductDraftRepository.create',
          'CATALOG_WRITE_FAILED',
          'Could not create the product draft.',
        );
      }

      const created = await this.findById(input.id);
      if (created === undefined) {
        throw guardViolationError(
          'ProductDraftRepository.create',
          'CATALOG_WRITE_FAILED',
          'Could not read back the product draft.',
        );
      }
      return created;
    });
  }

  async updateGuarded(input: UpdateProductDraftInput): Promise<GuardedWriteResult> {
    return this.run('updateGuarded', async () => {
      const patch: Record<string, unknown> = { updatedAt: nextUpdatedAt() };
      if (input.fields.name !== undefined) patch['name'] = input.fields.name;
      if (input.fields.basePriceAmount !== undefined) {
        patch['basePriceAmount'] = input.fields.basePriceAmount;
      }
      if (input.fields.categoryId !== undefined) patch['categoryId'] = input.fields.categoryId;
      // `null` is an explicit clear; `undefined` means the patch omitted it.
      if (input.fields.description !== undefined) {
        patch['description'] = input.fields.description;
      }

      const [row] = await this.db
        .update(products)
        .set(patch)
        .where(
          and(
            eq(products.id, input.id),
            inArray(products.status, [...input.editableStates]),
            updatedAtMatches(input.expectedUpdatedAt),
          ),
        )
        // The committed token comes back from the write itself, so the caller
        // publishes the value the database actually stored.
        .returning({ id: products.id, updatedAt: products.updatedAt });

      if (row === undefined) {
        return {
          ok: false,
          reason: await this.explainMiss(input.id, input.expectedUpdatedAt, input.editableStates),
        };
      }
      const product = await this.findById(input.id);
      return product === undefined ? { ok: false, reason: 'NOT_FOUND' } : { ok: true, product };
    });
  }

  async archiveGuarded(input: ArchiveProductDraftInput): Promise<GuardedWriteResult> {
    return this.run('archiveGuarded', async () => {
      const [row] = await this.db
        .update(products)
        .set({
          status: PRODUCT_ARCHIVED_STATE,
          // Archiving stamps the instant, matching the DB7 convention. Both
          // columns take the same strictly-advancing database value, so an
          // archive can never publish a token a previous write already used.
          archivedAt: nextUpdatedAt(),
          updatedAt: nextUpdatedAt(),
        })
        .where(
          and(
            eq(products.id, input.id),
            inArray(products.status, [...input.archivableStates]),
            updatedAtMatches(input.expectedUpdatedAt),
          ),
        )
        .returning({ id: products.id, updatedAt: products.updatedAt });

      if (row === undefined) {
        return {
          ok: false,
          reason: await this.explainMiss(input.id, input.expectedUpdatedAt, input.archivableStates),
        };
      }
      const product = await this.findById(input.id);
      return product === undefined ? { ok: false, reason: 'NOT_FOUND' } : { ok: true, product };
    });
  }

  /**
   * Distinguishes the three guard misses, read inside the same transaction as
   * the failed UPDATE so the snapshot cannot have moved underneath it.
   */
  private async explainMiss(
    id: ProductDraftId,
    expectedUpdatedAt: Date,
    allowedStates: readonly string[],
  ): Promise<'NOT_FOUND' | 'STATE' | 'STALE'> {
    const [row] = await this.db
      .select({ status: products.status, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (row === undefined) {
      return 'NOT_FOUND';
    }
    if (!allowedStates.includes(row.status)) {
      return 'STATE';
    }
    return row.updatedAt.getTime() === expectedUpdatedAt.getTime() ? 'NOT_FOUND' : 'STALE';
  }

  async replaceMedia(
    productId: ProductDraftId,
    links: readonly ProductDraftMediaLink[],
  ): Promise<void> {
    return this.run('replaceMedia', async () => {
      // Links only. The Assets and their derivatives are untouched — this table
      // holds the association, never the media.
      await this.db.delete(productMedia).where(eq(productMedia.productId, productId));
      if (links.length === 0) {
        return;
      }
      await this.db.insert(productMedia).values(
        links.map((link) => ({
          id: newId(),
          productId,
          assetId: link.assetId,
          role: link.role,
          displayOrder: link.displayOrder,
        })),
      );
    });
  }

  async findById(id: ProductDraftId): Promise<ProductDraft | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select(this.selection())
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.id, id))
        .limit(1);
      return row === undefined ? undefined : toProductDraft(row);
    });
  }

  async findBySlug(slug: string): Promise<ProductDraft | undefined> {
    return this.run('findBySlug', async () => {
      const [row] = await this.db
        .select(this.selection())
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.slug, slug))
        .limit(1);
      return row === undefined ? undefined : toProductDraft(row);
    });
  }

  async list(query: ProductDraftListQuery): Promise<ProductDraft[]> {
    return this.run('list', async () => {
      const conditions = [];
      if (query.filter.status !== undefined) {
        conditions.push(eq(products.status, query.filter.status));
      }
      if (query.filter.categoryId !== undefined) {
        conditions.push(eq(products.categoryId, query.filter.categoryId));
      }
      if (query.after !== undefined) {
        // Keyset resume on the exact (created_at, id) pair the last page ended
        // at — DB5 requires a tie-breaker, because `created_at` is not unique.
        conditions.push(
          or(
            lt(products.createdAt, query.after.createdAt),
            and(eq(products.createdAt, query.after.createdAt), lt(products.id, query.after.id)),
          ),
        );
      }

      const rows = await this.db
        .select(this.selection())
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(query.limit + 1);

      return rows.map((row) => toProductDraft(row as ProductDraftJoinedRow));
    });
  }

  async findMedia(productId: ProductDraftId): Promise<ProductDraftMedia[]> {
    const byProduct = await this.findMediaFor([productId]);
    return byProduct.get(productId) ?? [];
  }

  async findMediaFor(
    productIds: readonly ProductDraftId[],
  ): Promise<Map<string, ProductDraftMedia[]>> {
    return this.run('findMediaFor', async () => {
      const result = new Map<string, ProductDraftMedia[]>();
      if (productIds.length === 0) {
        return result;
      }

      // One round trip for every product on the page, never one per row.
      const rows = await this.db
        .select({
          productId: productMedia.productId,
          assetId: productMedia.assetId,
          role: productMedia.role,
          displayOrder: productMedia.displayOrder,
          mediaType: assets.mimeType,
          byteSize: assets.sizeBytes,
          status: assets.status,
          assetCreatedAt: assets.createdAt,
        })
        .from(productMedia)
        .innerJoin(assets, eq(assets.id, productMedia.assetId))
        .where(inArray(productMedia.productId, [...productIds]))
        .orderBy(asc(productMedia.productId), asc(productMedia.displayOrder));

      for (const row of rows) {
        const existing = result.get(row.productId) ?? [];
        existing.push(toProductDraftMedia(row));
        result.set(row.productId, existing);
      }
      return result;
    });
  }
}
