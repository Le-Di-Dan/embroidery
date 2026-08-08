/**
 * Drizzle implementation of the AGG-12 Design Template contract
 * (TBL-034..TBL-036).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import type {
  CreateDesignTemplateInput,
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
  DesignTemplateVersion,
  ListDesignTemplatesInput,
  PublishDesignTemplateVersionInput,
} from '../../domain/repositories/design-template.repository';
import { toTemplate, toTemplateVersion } from './design-row.mapper';

const { designTemplates, designTemplateVersions, designTemplateAssets } = schema;

@Injectable()
export class DrizzleDesignTemplateRepository
  extends DrizzleRepository
  implements DesignTemplateRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: CreateDesignTemplateInput): Promise<DesignTemplate> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(designTemplates)
        .values({
          id: input.id,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          productId: input.productId ?? null,
          productSideId: input.productSideId ?? null,
          embroideryAreaId: input.embroideryAreaId ?? null,
          status: 'DRAFT',
          currentVersion: 0,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignTemplateRepository.create',
          'DESIGN_TEMPLATE_NOT_CREATED',
          'Could not create the design template.',
        );
      }
      return toTemplate(row);
    });
  }

  async publishVersion(input: PublishDesignTemplateVersionInput): Promise<DesignTemplateVersion> {
    return this.run('publishVersion', async () => {
      const tx = this.requireTransaction('publishVersion');

      const [template] = await tx
        .select()
        .from(designTemplates)
        .where(eq(designTemplates.id, input.designTemplateId))
        .limit(1)
        .for('update');

      if (template === undefined) {
        throw notFoundError(
          'DesignTemplateRepository.publishVersion',
          'That design template does not exist.',
        );
      }

      const nextVersion = template.currentVersion + 1;

      const [version] = await tx
        .insert(designTemplateVersions)
        .values({
          id: input.id,
          designTemplateId: input.designTemplateId,
          version: nextVersion,
          designDocument: input.designDocument,
          documentSchemaVersion: input.documentSchemaVersion,
          publishedAt: input.publishedAt,
        })
        .returning();

      if (version === undefined) {
        throw guardViolationError(
          'DesignTemplateRepository.publishVersion',
          'DESIGN_TEMPLATE_VERSION_NOT_CREATED',
          'Could not publish the design template version.',
        );
      }

      // The counter and the version row move together — `current_version`
      // can never point past the last version actually written.
      await tx
        .update(designTemplates)
        .set({ currentVersion: nextVersion, status: 'PUBLISHED', updatedAt: new Date() })
        .where(eq(designTemplates.id, input.designTemplateId));

      return toTemplateVersion(version);
    });
  }

  async setPreviewDerivative(id: DesignTemplateId, previewDerivativeId: string): Promise<void> {
    return this.run('setPreviewDerivative', async () => {
      const [row] = await this.db
        .update(designTemplates)
        .set({ previewDerivativeId, updatedAt: new Date() })
        .where(eq(designTemplates.id, id))
        .returning({ id: designTemplates.id });

      if (row === undefined) {
        throw notFoundError(
          'DesignTemplateRepository.setPreviewDerivative',
          'That design template does not exist.',
        );
      }
    });
  }

  async attachAsset(id: DesignTemplateId, assetId: string): Promise<void> {
    return this.run('attachAsset', async () => {
      await this.db
        .insert(designTemplateAssets)
        .values({ id: newId(), designTemplateId: id, assetId });
    });
  }

  async archive(id: DesignTemplateId, at: Date): Promise<void> {
    return this.run('archive', async () => {
      const [row] = await this.db
        .update(designTemplates)
        .set({ status: 'ARCHIVED', archivedAt: at, updatedAt: at })
        .where(eq(designTemplates.id, id))
        .returning({ id: designTemplates.id });

      if (row === undefined) {
        throw notFoundError(
          'DesignTemplateRepository.archive',
          'That design template does not exist.',
        );
      }
    });
  }

  async findById(id: DesignTemplateId): Promise<DesignTemplate | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(designTemplates)
        .where(eq(designTemplates.id, id))
        .limit(1);
      return row === undefined ? undefined : toTemplate(row);
    });
  }

  async findBySlug(slug: string): Promise<DesignTemplate | undefined> {
    return this.run('findBySlug', async () => {
      const [row] = await this.db
        .select()
        .from(designTemplates)
        .where(eq(designTemplates.slug, slug))
        .limit(1);
      return row === undefined ? undefined : toTemplate(row);
    });
  }

  async loadPublished(
    id: DesignTemplateId,
  ): Promise<{ template: DesignTemplate; version: DesignTemplateVersion } | undefined> {
    return this.run('loadPublished', async () => {
      const [template] = await this.db
        .select()
        .from(designTemplates)
        .where(and(eq(designTemplates.id, id), eq(designTemplates.status, 'PUBLISHED')))
        .limit(1);

      if (template === undefined) {
        return undefined;
      }

      const [version] = await this.db
        .select()
        .from(designTemplateVersions)
        .where(
          and(
            eq(designTemplateVersions.designTemplateId, id),
            eq(designTemplateVersions.version, template.currentVersion),
          ),
        )
        .limit(1);

      if (version === undefined) {
        return undefined;
      }

      return { template: toTemplate(template), version: toTemplateVersion(version) };
    });
  }

  /**
   * One keyset page, newest first.
   *
   * The position predicate is the standard row-comparison
   * `(created_at, id) < (cursor.created_at, cursor.id)` written out as an `or`
   * of two `and`s, because Drizzle has no row-value constructor. Writing it as
   * `created_at <= cursor` alone would re-emit every row sharing the cursor's
   * timestamp on the next page.
   */
  async list(input: ListDesignTemplatesInput): Promise<DesignTemplate[]> {
    return this.run('list', async () => {
      const conditions = [
        input.filter.status === undefined
          ? undefined
          : eq(designTemplates.status, input.filter.status),
        input.filter.productId === undefined
          ? undefined
          : eq(designTemplates.productId, input.filter.productId),
        input.after === undefined
          ? undefined
          : or(
              lt(designTemplates.createdAt, input.after.createdAt),
              and(
                eq(designTemplates.createdAt, input.after.createdAt),
                lt(designTemplates.id, input.after.id),
              ),
            ),
      ].filter((condition) => condition !== undefined);

      const rows = await this.db
        .select()
        .from(designTemplates)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(desc(designTemplates.createdAt), desc(designTemplates.id))
        // One more than the page: `buildPage` detects the next page by the
        // presence of that extra row, so fetching exactly `limit` would report
        // `hasNext: false` on every full page and truncate the list at one page.
        .limit(input.limit + 1);

      return rows.map(toTemplate);
    });
  }

  async findLatestVersion(id: DesignTemplateId): Promise<DesignTemplateVersion | undefined> {
    return this.run('findLatestVersion', async () => {
      const [row] = await this.db
        .select()
        .from(designTemplateVersions)
        .where(eq(designTemplateVersions.designTemplateId, id))
        .orderBy(desc(designTemplateVersions.version))
        .limit(1);
      return row === undefined ? undefined : toTemplateVersion(row);
    });
  }

  async listAssetIds(id: DesignTemplateId): Promise<string[]> {
    return this.run('listAssetIds', async () => {
      const rows = await this.db
        .select({ assetId: designTemplateAssets.assetId })
        .from(designTemplateAssets)
        .where(eq(designTemplateAssets.designTemplateId, id));
      return rows.map((row) => row.assetId);
    });
  }
}
