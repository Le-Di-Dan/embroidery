/**
 * The wire shape of the public category inventory (`APP12-C01`).
 *
 * Separate from the DTO classes in `presentation/schemas/public-category.response.ts`
 * on purpose: those exist for OpenAPI and the generated client, these are what
 * the runtime actually returns, and keeping the two apart means adding a field
 * to one and forgetting the other is a type error rather than a silently
 * undocumented field. Same arrangement as `public-sitemap.projection.ts`.
 *
 * The projection is the last place a physical fact could leak, so it is written
 * as an explicit field list rather than a spread: `id`, `description`,
 * `seoTitle`, `seoDescription`, `status`, `archivedAt`, `createdAt` and
 * `updatedAt` are not merely unmapped here — there is no row shape that could
 * carry them through, because {@link PublicCategoryRow} never selects them.
 */
import type { PublicCategoryRow } from '../domain/repositories/public-category.repository';

export interface PublicCategoryView {
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

export interface PublicCategoryListView {
  readonly items: readonly PublicCategoryView[];
}

/** One row to one wire item. Total, and it invents nothing. */
export function toPublicCategory(row: PublicCategoryRow): PublicCategoryView {
  return {
    slug: row.slug,
    name: row.name,
    isIndexable: row.isIndexable,
    displayOrder: row.displayOrder,
  };
}
