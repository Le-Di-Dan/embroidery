/**
 * The public Design Template read, in SQL (`APP3-B05`).
 *
 * There is no `insert`, no `update`, no `delete` and no `for('update')` in this
 * file, and its absence is the point rather than an accident of what the two
 * operations happened to need: `APP3-B05` guarantees zero writes, and an adapter
 * that has no write to call cannot make one.
 *
 * ## Two statements, never one per row
 *
 * The header page and the published versions are two queries, both bounded by
 * the page size. Resolving each Template's version separately would be the N+1
 * the backend standard §8 forbids; joining them into a single statement would
 * need a lateral, and the pair below expresses the same thing with a
 * `DISTINCT ON` Postgres evaluates once.
 *
 * Neither statement selects `design_document` for the list. The picker chooses
 * between Templates and does not paint them, so the documents of a hundred
 * Templates are a payload nobody asked for — and the moment a list carries them,
 * the cheapest way to keep it fast becomes truncating the document, which is a
 * different contract wearing the same field name.
 *
 * ## Publication is two facts, and both are in the predicate
 *
 * A Template is publicly visible when its header is `PUBLISHED` **and** it holds
 * a version whose `published_at` is not null; the version shown is the highest
 * such version. `current_version` is never consulted. In every state the
 * delivered lifecycle can reach the two coincide — `APP3-B03A` saves only while
 * `DRAFT`, `APP3-B04` publishes only from `DRAFT` — and that is exactly why the
 * public read must not lean on it: a row that predates the lifecycle, or one
 * restored from a backup, must not be able to publish a version nobody
 * published.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, desc, eq, exists, inArray, isNotNull, lt, or } from 'drizzle-orm';

import type {
  ListPublishedTemplatesInput,
  PublishedDesignTemplate,
  PublishedDesignTemplateRepository,
} from '../../domain/repositories/published-design-template.repository';
import { toTemplate, toTemplateVersion, type TemplateRow } from './design-row.mapper';

const { designTemplates, designTemplateVersions } = schema;

/** The one lifecycle state a public caller may observe (`IMP-D042` LC-24). */
const PUBLIC_TEMPLATE_STATE = 'PUBLISHED' as const;

@Injectable()
export class DrizzlePublishedDesignTemplateRepository
  extends DrizzleRepository
  implements PublishedDesignTemplateRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listPublished(input: ListPublishedTemplatesInput): Promise<PublishedDesignTemplate[]> {
    return this.run('listPublished', async () => {
      const conditions = [
        eq(designTemplates.status, PUBLIC_TEMPLATE_STATE),
        // Exact triple equality, all three ids. `IMP-D042` PO-06 admits no
        // product-wide, side-wide or wildcard compatibility, so there is no
        // branch here that omits one of them and matches more rows.
        eq(designTemplates.productId, input.scope.productId),
        eq(designTemplates.productSideId, input.scope.productSideId),
        eq(designTemplates.embroideryAreaId, input.scope.embroideryAreaId),
        // A `PUBLISHED` header that holds no published version shows nothing.
        // Correlated, so it costs one index probe per candidate row rather than
        // a second round trip per Template.
        this.hasPublishedVersion(),
        input.after === undefined
          ? undefined
          : // `(created_at, id) < (cursor.created_at, cursor.id)`, written out
            // because Drizzle has no row-value constructor. `created_at <=`
            // alone would re-emit every row sharing the cursor's timestamp.
            or(
              lt(designTemplates.createdAt, input.after.createdAt),
              and(
                eq(designTemplates.createdAt, input.after.createdAt),
                lt(designTemplates.id, input.after.id),
              ),
            ),
      ].filter((condition) => condition !== undefined);

      const headers = await this.db
        .select()
        .from(designTemplates)
        .where(and(...conditions))
        .orderBy(desc(designTemplates.createdAt), desc(designTemplates.id))
        // One more than the page, so the caller can detect a next page from the
        // extra row instead of a second COUNT.
        .limit(input.limit + 1);

      if (headers.length === 0) return [];
      return this.pairWithPublishedVersions(headers);
    });
  }

  async findPublishedBySlug(slug: string): Promise<PublishedDesignTemplate | undefined> {
    return this.run('findPublishedBySlug', async () => {
      const [header] = await this.db
        .select()
        .from(designTemplates)
        .where(
          and(
            eq(designTemplates.slug, slug),
            eq(designTemplates.status, PUBLIC_TEMPLATE_STATE),
            this.hasPublishedVersion(),
          ),
        )
        .limit(1);

      if (header === undefined) return undefined;
      const [paired] = await this.pairWithPublishedVersions([header]);
      return paired;
    });
  }

  /**
   * `EXISTS (… published_at IS NOT NULL)` for the header row in scope.
   *
   * Correlated to `design_templates.id` rather than parameterised, so the same
   * fragment serves both operations and neither can drift into a weaker test.
   */
  private hasPublishedVersion() {
    return exists(
      this.db
        .select({ one: designTemplateVersions.id })
        .from(designTemplateVersions)
        .where(
          and(
            eq(designTemplateVersions.designTemplateId, designTemplates.id),
            isNotNull(designTemplateVersions.publishedAt),
          ),
        ),
    );
  }

  /**
   * The highest published version of each header, in one statement.
   *
   * `DISTINCT ON (design_template_id)` with `ORDER BY design_template_id,
   * version DESC` is Postgres' first-row-per-group: exactly one row per
   * Template, chosen by version, filtered to published ones before the choosing.
   * Reading every version and picking in JavaScript would return the whole
   * version history of every Template on the page.
   *
   * A header whose version has disappeared between the two statements is
   * dropped rather than answered with a fabricated one — the `EXISTS` above
   * makes that a torn read, not an ordinary state, and a public read fails
   * closed.
   */
  private async pairWithPublishedVersions(
    headers: readonly TemplateRow[],
  ): Promise<PublishedDesignTemplate[]> {
    const versionRows = await this.db
      .selectDistinctOn([designTemplateVersions.designTemplateId])
      .from(designTemplateVersions)
      .where(
        and(
          inArray(
            designTemplateVersions.designTemplateId,
            headers.map((header) => header.id),
          ),
          isNotNull(designTemplateVersions.publishedAt),
        ),
      )
      .orderBy(designTemplateVersions.designTemplateId, desc(designTemplateVersions.version));

    const byTemplate = new Map(versionRows.map((row) => [row.designTemplateId, row]));

    return headers.flatMap((header) => {
      const version = byTemplate.get(header.id);
      return version === undefined
        ? []
        : [{ template: toTemplate(header), version: toTemplateVersion(version) }];
    });
  }
}
