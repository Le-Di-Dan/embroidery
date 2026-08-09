/**
 * The authoring half of the AGG-12 Design Template adapter: everything that
 * creates a template, writes a version, binds a scope or associates an asset
 * (`APP3-B03`, `APP3-B03A`, `APP3-B03B`).
 *
 * Split out of `drizzle-design-template.repository.ts` by `APP3-B04A`, which
 * closed `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`: that file stood at 563 lines
 * against the CLAUDE.md §6 hard maximum of 400 and the restore transition would
 * have grown it again. The line was drawn by responsibility rather than by line
 * range — authoring writes here, the LC-24 transitions in
 * `design-template-lifecycle.writes.ts`, and the reads the port composes in the
 * adapter itself.
 *
 * This is **not** a second repository authority. It has no token, no port and no
 * provider; the one `DesignTemplateRepository` implementation composes it, so
 * every caller still goes through one contract and one boundary.
 */
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { type DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, isNull, notExists, sql } from 'drizzle-orm';

import type {
  AssignDesignTemplateScopeInput,
  CreateDesignTemplateInput,
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateVersion,
  PublishDesignTemplateVersionInput,
  SaveDesignTemplateDraftVersionInput,
} from '../../domain/repositories/design-template.repository';
import { toTemplate, toTemplateVersion } from './design-row.mapper';

const { designTemplates, designTemplateVersions, designTemplateAssets } = schema;

export class DesignTemplateAuthoringWrites extends DrizzleRepository {
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

  /**
   * The draft save, as one compare-and-set (`APP3-B03A`).
   *
   * The counter is advanced with the expected value **in the predicate** rather
   * than read-then-written: two saves racing on the same `expectedCurrentVersion`
   * both reach the `update`, and exactly one matches a row. Postgres serialises
   * them on the row lock, so the loser re-reads a counter that has already moved
   * and matches nothing.
   *
   * The counter moves *before* the version row is inserted, so the loser is
   * rejected without either statement having written a version — and the unique
   * `(design_template_id, version)` is a second, independent guard rather than
   * the primary one, because relying on it would mean discovering the conflict
   * as a constraint violation after doing the work.
   */
  async saveDraftVersion(
    input: SaveDesignTemplateDraftVersionInput,
  ): Promise<DesignTemplateVersion> {
    return this.run('saveDraftVersion', async () => {
      const tx = this.requireTransaction('saveDraftVersion');
      const nextVersion = input.expectedCurrentVersion + 1;

      const [advanced] = await tx
        .update(designTemplates)
        .set({ currentVersion: nextVersion, updatedAt: new Date() })
        .where(
          and(
            eq(designTemplates.id, input.designTemplateId),
            eq(designTemplates.status, 'DRAFT'),
            eq(designTemplates.currentVersion, input.expectedCurrentVersion),
          ),
        )
        .returning({ id: designTemplates.id });

      if (advanced === undefined) {
        const [current] = await tx
          .select({ id: designTemplates.id })
          .from(designTemplates)
          .where(eq(designTemplates.id, input.designTemplateId))
          .limit(1);

        if (current === undefined) {
          throw notFoundError(
            'DesignTemplateRepository.saveDraftVersion',
            'That design template does not exist.',
          );
        }
        // One code for both remaining causes on purpose: a caller learning
        // "not DRAFT" separately from "counter moved" learns the template's
        // lifecycle state from a save it was not allowed to make.
        throw guardViolationError(
          'DesignTemplateRepository.saveDraftVersion',
          'STALE_WRITE',
          'This design template changed since it was loaded.',
        );
      }

      const [version] = await tx
        .insert(designTemplateVersions)
        .values({
          id: input.id,
          designTemplateId: input.designTemplateId,
          version: nextVersion,
          designDocument: input.designDocument,
          documentSchemaVersion: input.documentSchemaVersion,
          // Null, always. `IMP-D042` PO-04: publish sets this once, later, and
          // never clears it — a draft save must not pre-stamp it.
          publishedAt: null,
        })
        .returning();

      if (version === undefined) {
        throw guardViolationError(
          'DesignTemplateRepository.saveDraftVersion',
          'DESIGN_TEMPLATE_VERSION_NOT_CREATED',
          'Could not save the design template version.',
        );
      }
      return toTemplateVersion(version);
    });
  }

  async assignInitialScope(input: AssignDesignTemplateScopeInput): Promise<DesignTemplate> {
    return this.run('assignInitialScope', async () => {
      const tx = this.requireTransaction('assignInitialScope');

      // Every condition of the ruling is in the predicate. The three `isNull`
      // checks are what make the assignment one-time: a Template that already
      // has a scope cannot match, so a rescope is unrepresentable here rather
      // than merely unimplemented.
      //
      // The `notExists` is not redundant with `currentVersion = 0`. The counter
      // and the version rows are advanced together by `saveDraftVersion`, so
      // they agree in every state this code can produce — but "agree in every
      // state we can produce" is an assumption, and the ruling says *zero
      // immutable versions*. Asserting the thing the ruling names costs one
      // correlated subquery and fails closed if the two ever diverge.
      const [assigned] = await tx
        .update(designTemplates)
        .set({
          productId: input.productId,
          productSideId: input.productSideId,
          embroideryAreaId: input.embroideryAreaId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(designTemplates.id, input.id),
            eq(designTemplates.status, 'DRAFT'),
            eq(designTemplates.currentVersion, 0),
            isNull(designTemplates.productId),
            isNull(designTemplates.productSideId),
            isNull(designTemplates.embroideryAreaId),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(designTemplateVersions)
                .where(eq(designTemplateVersions.designTemplateId, input.id)),
            ),
          ),
        )
        .returning();

      if (assigned === undefined) {
        const [current] = await tx
          .select({ id: designTemplates.id })
          .from(designTemplates)
          .where(eq(designTemplates.id, input.id))
          .limit(1);

        if (current === undefined) {
          throw notFoundError(
            'DesignTemplateRepository.assignInitialScope',
            'That design template does not exist.',
          );
        }
        // One code for every remaining cause on purpose, exactly as
        // `saveDraftVersion` does: a caller learning "already scoped" separately
        // from "not DRAFT" separately from "has versions" learns the template's
        // lifecycle state from a write it was not allowed to make.
        throw guardViolationError(
          'DesignTemplateRepository.assignInitialScope',
          'STALE_WRITE',
          'This design template can no longer be given an initial scope.',
        );
      }
      return toTemplate(assigned);
    });
  }

  async ensureAssetAssociation(
    id: DesignTemplateId,
    assetId: string,
  ): Promise<{ readonly designTemplateAssetId: string; readonly created: boolean }> {
    return this.run('ensureAssetAssociation', async () => {
      const tx = this.requireTransaction('ensureAssetAssociation');

      const [inserted] = await tx
        .insert(designTemplateAssets)
        .values({ id: newId(), designTemplateId: id, assetId })
        // The unique `(template, asset)` decides, not a prior read: two saves
        // referencing the same new Asset would both see it absent and both
        // insert, and exactly one row must exist with exactly one event behind
        // it.
        .onConflictDoNothing({
          target: [designTemplateAssets.designTemplateId, designTemplateAssets.assetId],
        })
        .returning({ id: designTemplateAssets.id });

      if (inserted !== undefined) {
        return { designTemplateAssetId: inserted.id, created: true };
      }

      const [existing] = await tx
        .select({ id: designTemplateAssets.id })
        .from(designTemplateAssets)
        .where(
          and(
            eq(designTemplateAssets.designTemplateId, id),
            eq(designTemplateAssets.assetId, assetId),
          ),
        )
        .limit(1);

      if (existing === undefined) {
        throw guardViolationError(
          'DesignTemplateRepository.ensureAssetAssociation',
          'DESIGN_TEMPLATE_ASSET_NOT_ASSOCIATED',
          'Could not associate that asset with the design template.',
        );
      }
      return { designTemplateAssetId: existing.id, created: false };
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
}
