/**
 * The four LC-24 header transitions, as one shape (`APP3-B04` + `APP3-B04A`).
 *
 *   publish    DRAFT → PUBLISHED            TR-LC24-02
 *   unpublish  PUBLISHED → DRAFT            TR-LC24-03
 *   archive    DRAFT|PUBLISHED → ARCHIVED   TR-LC24-04 / TR-LC24-05
 *   restore    ARCHIVED → DRAFT             TR-LC24-06
 *
 * Split out of `drizzle-design-template.repository.ts` by `APP3-B04A` together
 * with the authoring writes, closing `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`.
 * These four belong together because they are literally one statement with four
 * parameterisations, and because the property that matters — the compare-and-set
 * — is a property of the shared `transition` rather than of any one of them.
 *
 * Not a second repository authority: no token, no port, no provider. The one
 * `DesignTemplateRepository` implementation composes this.
 */
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import { type DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { DesignTemplateState } from '@embroidery/database';

import type { DesignTemplateLifecycleInput } from '../../domain/repositories/design-template.repository';

const { designTemplates, designTemplateVersions } = schema;

export class DesignTemplateLifecycleWrites extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Every transition is a single guarded `UPDATE`: the source state and the
   * expected counter are **in the predicate**, so two concurrent transitions on
   * the same template serialise on the row and exactly one matches. A
   * read-then-update would let a publish and an archive both read `DRAFT` and
   * both proceed.
   *
   * `current_version` is never in the `SET`. The publication subject is the
   * version `APP3-B03A` already wrote, and a lifecycle transition that moved the
   * counter would silently change which version is published — or, on restore,
   * which retained version comes back.
   */
  private async transition(
    operation: string,
    input: DesignTemplateLifecycleInput,
    from: readonly DesignTemplateState[],
    set: Record<string, unknown>,
  ): Promise<void> {
    const tx = this.requireTransaction(operation);

    const [changed] = await tx
      .update(designTemplates)
      .set(set)
      .where(
        and(
          eq(designTemplates.id, input.id),
          inArray(designTemplates.status, [...from]),
          eq(designTemplates.currentVersion, input.expectedCurrentVersion),
        ),
      )
      .returning({ id: designTemplates.id });

    if (changed !== undefined) return;

    const [current] = await tx
      .select({ id: designTemplates.id })
      .from(designTemplates)
      .where(eq(designTemplates.id, input.id))
      .limit(1);

    if (current === undefined) {
      throw notFoundError(
        `DesignTemplateRepository.${operation}`,
        'That design template does not exist.',
      );
    }
    // One code for "wrong state" and "counter moved" alike: distinguishing them
    // would tell a caller the template's lifecycle state through a transition it
    // was not allowed to make.
    throw guardViolationError(
      `DesignTemplateRepository.${operation}`,
      'STALE_WRITE',
      'This design template changed since it was loaded.',
    );
  }

  async publishCurrentVersion(
    input: DesignTemplateLifecycleInput & { readonly at: Date },
  ): Promise<void> {
    return this.run('publishCurrentVersion', async () => {
      const tx = this.requireTransaction('publishCurrentVersion');
      await this.transition('publishCurrentVersion', input, ['DRAFT'], {
        status: 'PUBLISHED',
        updatedAt: input.at,
      });

      // `published_at` is stamped **only when null**. A republication of the same
      // version keeps its original timestamp, which is what `IMP-D042` PO-04
      // means by set once and never rewritten — expressed as a predicate rather
      // than as a read-and-branch, so a concurrent republish cannot overwrite it
      // between the read and the write.
      await tx
        .update(designTemplateVersions)
        .set({ publishedAt: input.at })
        .where(
          and(
            eq(designTemplateVersions.designTemplateId, input.id),
            eq(designTemplateVersions.version, input.expectedCurrentVersion),
            isNull(designTemplateVersions.publishedAt),
          ),
        );
    });
  }

  async unpublish(input: DesignTemplateLifecycleInput): Promise<void> {
    return this.run('unpublish', async () => {
      // The header only. Versions and their timestamps survive untouched:
      // editing after an unpublish creates a *new* immutable version rather than
      // reopening the one that was published.
      await this.transition('unpublish', input, ['PUBLISHED'], {
        status: 'DRAFT',
        updatedAt: new Date(),
      });
    });
  }

  async archive(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void> {
    return this.run('archive', async () => {
      // Both source states in one predicate: `TR-LC24-04` and `TR-LC24-05` are
      // the same durable retirement, and archive is never a delete.
      await this.transition('archive', input, ['DRAFT', 'PUBLISHED'], {
        status: 'ARCHIVED',
        archivedAt: input.at,
        updatedAt: input.at,
      });
    });
  }

  /**
   * `TR-LC24-06` — the exact inverse of what archive marked, and nothing else.
   *
   * `archived_at` is cleared because DB3 LC-24 defines this transition as
   * *"header, clears `archived_at`"*: the column is the **current** archive-state
   * marker, not a historical record, and a restored `DRAFT` still carrying it
   * would read as archived to every query that asks the column rather than the
   * status. The history of the archive and of this restore lives in Audit, with
   * the reason PO-03 requires for both.
   *
   * `ARCHIVED` is the sole source state, so `ARCHIVED → PUBLISHED` cannot be
   * expressed here at all; republication is `publishCurrentVersion` and runs the
   * whole GRD-T01 guard again. Nothing else is in the `SET`: no version is
   * created, no `published_at` is touched, no scope is repaired and no
   * association changes — restore returns retained data to editable `DRAFT`.
   */
  async restore(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void> {
    return this.run('restore', async () => {
      await this.transition('restore', input, ['ARCHIVED'], {
        status: 'DRAFT',
        archivedAt: null,
        updatedAt: input.at,
      });
    });
  }
}
