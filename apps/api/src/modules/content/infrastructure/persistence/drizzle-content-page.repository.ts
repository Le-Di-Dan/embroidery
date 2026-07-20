/**
 * Drizzle implementations of the AGG-19 Content Page and AGG-20 Redirect Rule
 * contracts (TBL-066, TBL-067).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { ContentPageState, ContentPageType, RedirectKind } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type {
  ContentPage,
  ContentPageId,
  ContentPageRepository,
  CreateContentPageInput,
  RedirectRule,
  RedirectRuleId,
  RedirectRuleRepository,
  UpsertRedirectInput,
} from '../../domain/repositories/content-page.repository';

const { contentPages, redirectRules } = schema;

type PageRow = typeof contentPages.$inferSelect;
type RedirectRow = typeof redirectRules.$inferSelect;

function toPage(row: PageRow): ContentPage {
  return {
    id: row.id as ContentPageId,
    pageType: row.pageType as ContentPageType,
    slug: row.slug,
    title: row.title,
    body: row.body ?? undefined,
    status: row.status as ContentPageState,
    isIndexable: row.isIndexable,
  };
}

function toRedirect(row: RedirectRow): RedirectRule {
  return {
    id: row.id as RedirectRuleId,
    sourcePath: row.sourcePath,
    targetPath: row.targetPath,
    redirectKind: row.redirectKind as RedirectKind,
    isActive: row.isActive,
  };
}

@Injectable()
export class DrizzleContentPageRepository
  extends DrizzleRepository
  implements ContentPageRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: CreateContentPageInput): Promise<ContentPage> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(contentPages)
        .values({
          id: input.id,
          pageType: input.pageType,
          slug: input.slug,
          title: input.title,
          body: input.body ?? null,
          status: 'DRAFT',
          isIndexable: true,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'ContentPageRepository.create',
          'CONTENT_PAGE_NOT_CREATED',
          'Could not create the page.',
        );
      }
      return toPage(row);
    });
  }

  async updateBody(
    id: ContentPageId,
    title: string,
    body: string | undefined,
  ): Promise<ContentPage> {
    return this.run('updateBody', async () => {
      const [row] = await this.db
        .update(contentPages)
        .set({ title, body: body ?? null, updatedAt: new Date() })
        .where(eq(contentPages.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError('ContentPageRepository.updateBody', 'That page does not exist.');
      }
      return toPage(row);
    });
  }

  async changeStatus(id: ContentPageId, status: ContentPageState): Promise<ContentPage> {
    return this.run('changeStatus', async () => {
      const [row] = await this.db
        .update(contentPages)
        .set({
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(contentPages.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError('ContentPageRepository.changeStatus', 'That page does not exist.');
      }
      return toPage(row);
    });
  }

  async findByTypeAndSlug(
    pageType: ContentPageType,
    slug: string,
  ): Promise<ContentPage | undefined> {
    return this.run('findByTypeAndSlug', async () => {
      const [row] = await this.db
        .select()
        .from(contentPages)
        .where(and(eq(contentPages.pageType, pageType), eq(contentPages.slug, slug)))
        .limit(1);
      return row === undefined ? undefined : toPage(row);
    });
  }

  async findById(id: ContentPageId): Promise<ContentPage | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(contentPages)
        .where(eq(contentPages.id, id))
        .limit(1);
      return row === undefined ? undefined : toPage(row);
    });
  }
}

@Injectable()
export class DrizzleRedirectRuleRepository
  extends DrizzleRepository
  implements RedirectRuleRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async upsert(input: UpsertRedirectInput): Promise<RedirectRule> {
    return this.run('upsert', async () => {
      // Re-pointing an existing source is an update, not a conflict: a source
      // path is unique by design, and an admin fixing a target should not have
      // to delete the old rule first.
      const [row] = await this.db
        .insert(redirectRules)
        .values({
          id: newId(),
          sourcePath: input.sourcePath,
          targetPath: input.targetPath,
          redirectKind: input.redirectKind,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: redirectRules.sourcePath,
          set: {
            targetPath: input.targetPath,
            redirectKind: input.redirectKind,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'RedirectRuleRepository.upsert',
          'REDIRECT_NOT_SAVED',
          'Could not save the redirect.',
        );
      }
      return toRedirect(row);
    });
  }

  async deactivate(sourcePath: string): Promise<void> {
    return this.run('deactivate', async () => {
      // Deactivated, not deleted: the row records that the path was once
      // redirected, which matters when diagnosing a lost URL.
      await this.db
        .update(redirectRules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(redirectRules.sourcePath, sourcePath));
    });
  }

  async resolve(sourcePath: string): Promise<RedirectRule | undefined> {
    return this.run('resolve', async () => {
      const [row] = await this.db
        .select()
        .from(redirectRules)
        .where(and(eq(redirectRules.sourcePath, sourcePath), eq(redirectRules.isActive, true)))
        .limit(1);
      return row === undefined ? undefined : toRedirect(row);
    });
  }
}
