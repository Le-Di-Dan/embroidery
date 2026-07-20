/**
 * Drizzle implementation of the AGG-05 Category contract (TBL-011).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { ProductState } from '@embroidery/database';
import { eq } from 'drizzle-orm';

import type {
  Category,
  CategoryId,
  CategoryRepository,
} from '../../domain/repositories/product.repository';
import { toCategory } from './product-row.mapper';

const { categories } = schema;

@Injectable()
export class DrizzleCategoryRepository extends DrizzleRepository implements CategoryRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: {
    id: CategoryId;
    name: string;
    slug: string;
    displayOrder: number;
  }): Promise<Category> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(categories)
        .values({
          id: input.id,
          name: input.name,
          slug: input.slug,
          status: 'DRAFT',
          displayOrder: input.displayOrder,
          isIndexable: true,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'CategoryRepository.create',
          'CATEGORY_NOT_CREATED',
          'Could not create the category.',
        );
      }
      return toCategory(row);
    });
  }

  async changeStatus(id: CategoryId, status: ProductState): Promise<Category> {
    return this.run('changeStatus', async () => {
      const [row] = await this.db
        .update(categories)
        .set({ status, updatedAt: new Date() })
        .where(eq(categories.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError('CategoryRepository.changeStatus', 'That category does not exist.');
      }
      return toCategory(row);
    });
  }

  async findBySlug(slug: string): Promise<Category | undefined> {
    return this.run('findBySlug', async () => {
      const [row] = await this.db
        .select()
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      return row === undefined ? undefined : toCategory(row);
    });
  }

  async findById(id: CategoryId): Promise<Category | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(categories).where(eq(categories.id, id)).limit(1);
      return row === undefined ? undefined : toCategory(row);
    });
  }
}
