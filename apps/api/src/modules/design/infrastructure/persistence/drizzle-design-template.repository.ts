/**
 * Drizzle implementation of the AGG-12 Design Template contract
 * (TBL-034..TBL-036).
 *
 * The single implementation of `DesignTemplateRepository`, and the only class
 * bound to `DESIGN_TEMPLATE_REPOSITORY`. It owns the reads directly and composes
 * two write collaborators — authoring (`APP3-B03`/`B03A`/`B03B`) and the LC-24
 * transitions (`APP3-B04`/`B04A`) — which `APP3-B04A` split out to close
 * `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`.
 *
 * The collaborators are constructed here rather than injected. They are
 * implementation detail of this adapter, not ports: giving them tokens and
 * providers would publish two more names into every module that binds the
 * repository, and would let a caller reach a write path without going through
 * the contract. They share this adapter's `DatabaseExecutor`, so a transaction
 * opened around a use case is the same ambient transaction all three see.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import type {
  AssignDesignTemplateScopeInput,
  CreateDesignTemplateInput,
  DesignTemplateLifecycleInput,
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
  DesignTemplateVersion,
  ListDesignTemplatesInput,
  PublishDesignTemplateVersionInput,
  SaveDesignTemplateDraftVersionInput,
} from '../../domain/repositories/design-template.repository';
import { DesignTemplateAuthoringWrites } from './design-template-authoring.writes';
import { DesignTemplateLifecycleWrites } from './design-template-lifecycle.writes';
import { toTemplate, toTemplateVersion } from './design-row.mapper';

const { designTemplates, designTemplateVersions, designTemplateAssets } = schema;

@Injectable()
export class DrizzleDesignTemplateRepository
  extends DrizzleRepository
  implements DesignTemplateRepository
{
  private readonly authoring: DesignTemplateAuthoringWrites;
  private readonly lifecycle: DesignTemplateLifecycleWrites;

  constructor(executor: DatabaseExecutor) {
    super(executor);
    this.authoring = new DesignTemplateAuthoringWrites(executor);
    this.lifecycle = new DesignTemplateLifecycleWrites(executor);
  }

  // --- authoring writes (APP3-B03 / B03A / B03B) ---------------------------

  create(input: CreateDesignTemplateInput): Promise<DesignTemplate> {
    return this.authoring.create(input);
  }

  publishVersion(input: PublishDesignTemplateVersionInput): Promise<DesignTemplateVersion> {
    return this.authoring.publishVersion(input);
  }

  saveDraftVersion(input: SaveDesignTemplateDraftVersionInput): Promise<DesignTemplateVersion> {
    return this.authoring.saveDraftVersion(input);
  }

  assignInitialScope(input: AssignDesignTemplateScopeInput): Promise<DesignTemplate> {
    return this.authoring.assignInitialScope(input);
  }

  ensureAssetAssociation(
    id: DesignTemplateId,
    assetId: string,
  ): Promise<{ readonly designTemplateAssetId: string; readonly created: boolean }> {
    return this.authoring.ensureAssetAssociation(id, assetId);
  }

  setPreviewDerivative(id: DesignTemplateId, previewDerivativeId: string): Promise<void> {
    return this.authoring.setPreviewDerivative(id, previewDerivativeId);
  }

  attachAsset(id: DesignTemplateId, assetId: string): Promise<void> {
    return this.authoring.attachAsset(id, assetId);
  }

  // --- LC-24 transitions (APP3-B04 / B04A) ---------------------------------

  publishCurrentVersion(
    input: DesignTemplateLifecycleInput & { readonly at: Date },
  ): Promise<void> {
    return this.lifecycle.publishCurrentVersion(input);
  }

  unpublish(input: DesignTemplateLifecycleInput): Promise<void> {
    return this.lifecycle.unpublish(input);
  }

  archive(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void> {
    return this.lifecycle.archive(input);
  }

  /** `TR-LC24-06`. Clears the current archive marker; preserves everything else. */
  restore(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void> {
    return this.lifecycle.restore(input);
  }

  // --- reads ---------------------------------------------------------------

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
