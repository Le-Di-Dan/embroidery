/**
 * Drizzle implementation of the Product publication contract (`APP2-B03`).
 *
 * Three round trips for the locked snapshot regardless of how many images a
 * product has — product+category, then media — and one guarded statement for
 * the transition itself. The repository opens no transaction of its own
 * (DEC-DB7-006); the use case owns that through `TransactionManager`.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import type { ProductState } from '@embroidery/database';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type {
  ProductDraft,
  ProductDraftId,
} from '../../domain/repositories/product-draft.repository';
import type {
  ProductPublicationRepository,
  ProductPublicationSnapshot,
  PublicationMediaRow,
  PublishProductInput,
} from '../../domain/repositories/product-publication.repository';
import { nextUpdatedAt, updatedAtMatches } from './product-concurrency-token';
import { toProductDraft } from './product-draft-row.mapper';

const { products, categories, productMedia } = schema;

@Injectable()
export class DrizzleProductPublicationRepository
  extends DrizzleRepository
  implements ProductPublicationRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /** Product columns, the category slug the Admin addresses by, and the category's own publication facts. */
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
      categoryStatus: categories.status,
      categoryArchivedAt: categories.archivedAt,
    };
  }

  async readSnapshot(id: ProductDraftId): Promise<ProductPublicationSnapshot> {
    return this.run('readSnapshot', async () => {
      const [row] = await this.db
        .select(this.selection())
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.id, id))
        .limit(1);

      if (row === undefined) {
        return { product: undefined, category: undefined, media: [] };
      }
      return {
        product: toProductDraft(row),
        category: {
          status: row.categoryStatus,
          archivedAt: row.categoryArchivedAt ?? undefined,
        },
        media: await this.readMedia(id),
      };
    });
  }

  async lockSnapshot(id: ProductDraftId): Promise<ProductPublicationSnapshot> {
    return this.run('lockSnapshot', async () => {
      const tx = this.requireTransaction('lockSnapshot');

      // Three statements rather than one join with two locking clauses: a
      // Drizzle select carries a *single* locking clause, so chaining
      // `.for('update')` and `.for('share')` would silently keep only the last
      // one and the product root would never be write-locked.
      //
      // The product root goes first and exclusively — this transaction intends
      // to write it, and taking that lock before anything else is what makes two
      // concurrent publishes of the same product serialise rather than both
      // reading the same stale status. `of: products` keeps the join from
      // locking `categories` exclusively as well, which would serialise every
      // publish in a category against each other.
      const [row] = await tx
        .select(this.selection())
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.id, id))
        .limit(1)
        .for('update', { of: products });

      if (row === undefined) {
        return { product: undefined, category: undefined, media: [] };
      }

      // The category only has to stay as it is until commit, so share mode is
      // enough and leaves concurrent readers — and other categories' publishes —
      // unblocked. Read again under the lock rather than trusting the joined
      // copy, which was read before any category lock was held.
      const [category] = await tx
        .select({ status: categories.status, archivedAt: categories.archivedAt })
        .from(categories)
        .where(eq(categories.id, row.categoryId))
        .limit(1)
        .for('share');

      return {
        product: toProductDraft(row),
        category:
          category === undefined
            ? undefined
            : { status: category.status, archivedAt: category.archivedAt ?? undefined },
        media: await this.readMedia(id, true),
      };
    });
  }

  /** The ordered selection, optionally share-locked for the rest of the transaction. */
  private async readMedia(id: ProductDraftId, lock = false): Promise<PublicationMediaRow[]> {
    const base = this.db
      .select({
        assetId: productMedia.assetId,
        role: productMedia.role,
        displayOrder: productMedia.displayOrder,
      })
      .from(productMedia)
      .where(eq(productMedia.productId, id))
      .orderBy(asc(productMedia.displayOrder));

    // Share mode: the links must not be replaced under this transaction, but a
    // concurrent *read* of the same product's media is harmless.
    const rows = await (lock ? base.for('share') : base);
    return rows.map((row) => ({
      assetId: row.assetId,
      role: row.role,
      displayOrder: row.displayOrder,
    }));
  }

  async transitionGuarded(input: PublishProductInput): Promise<ProductDraft | undefined> {
    return this.run('transitionGuarded', async () => {
      const [row] = await this.db
        .update(products)
        // Status and the token, and deliberately nothing else. `archived_at` is
        // never touched here: unpublish is not archive (IMP-D035), and publish
        // does not clear an archive fact it did not create.
        .set({ status: input.toState, updatedAt: nextUpdatedAt() })
        .where(
          and(
            eq(products.id, input.id),
            inArray(products.status, [...input.fromStates]),
            updatedAtMatches(input.expectedUpdatedAt),
          ),
        )
        .returning({ id: products.id });

      if (row === undefined) {
        return undefined;
      }
      return this.findById(input.id);
    });
  }

  async explainTransitionMiss(
    id: ProductDraftId,
    expectedUpdatedAt: Date,
    allowedStates: readonly ProductState[],
  ): Promise<'NOT_FOUND' | 'STATE' | 'STALE'> {
    return this.run('explainTransitionMiss', async () => {
      const [row] = await this.db
        .select({
          status: products.status,
          updatedAt: sql<Date>`date_trunc('milliseconds', ${products.updatedAt})`,
        })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (row === undefined) {
        return 'NOT_FOUND';
      }
      if (!(allowedStates as readonly string[]).includes(row.status)) {
        return 'STATE';
      }
      return row.updatedAt.getTime() === expectedUpdatedAt.getTime() ? 'NOT_FOUND' : 'STALE';
    });
  }

  private async findById(id: ProductDraftId): Promise<ProductDraft | undefined> {
    const [row] = await this.db
      .select(this.selection())
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.id, id))
      .limit(1);
    return row === undefined ? undefined : toProductDraft(row);
  }
}
