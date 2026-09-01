/**
 * The documented response shapes of the Admin category surface (`APP12-C02`).
 *
 * These classes exist for OpenAPI, and the generated client's types come from
 * them. The runtime projection lives in `admin-category.projection.ts`.
 *
 * ## The two enums here are rules, not values
 *
 * `status` publishes the lifecycle vocabulary and the transition body publishes
 * the action vocabulary. Both are closed sets this application owns and neither
 * names a category: `IMP-D062` forbids a compiled *category value* set, which is
 * what `AdminProductListCategorySlug` was and why it is gone. A consumer must
 * still read the taxonomy from this list, never from a type.
 *
 * Deliberately absent: `description`, `seoTitle`, `seoDescription`,
 * `createdAt`, and any browser URL. The first three belong to a category *page*
 * no checkpoint has approved; the last is a Storefront route shape the API does
 * not know exists.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { CategoryState } from '@embroidery/database';

import { CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';

const CATEGORY_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60c1';
const TOKEN_EXAMPLE = '2026-05-04T09:15:30.123Z';

/**
 * The published lifecycle vocabulary.
 *
 * A local tuple rather than a runtime import of the ORM schema namespace
 * (`BACKEND_CONVENTIONS.md` §3), tied to the canonical union by `satisfies`, so
 * a new lifecycle state stops this file compiling instead of silently vanishing
 * from the contract.
 */
export const PUBLISHED_CATEGORY_STATES = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const satisfies readonly CategoryState[];

/** Compile-time proof the published list omits no canonical category state. */
export type PublishedCategoryStatesAreComplete =
  Exclude<CategoryState, (typeof PUBLISHED_CATEGORY_STATES)[number]> extends never ? true : never;

export class AdminCategoryResponse {
  @ApiProperty({
    format: 'uuid',
    example: CATEGORY_ID_EXAMPLE,
    description:
      'The stable Admin key, and the path parameter of every category mutation. Never ' +
      'published on a public contract: an anonymous caller addresses a category by `slug`.',
  })
  id!: string;

  @ApiProperty({
    pattern: CATEGORY_SLUG_PATTERN.source,
    example: 'mu-luoi-trai',
    description:
      'The public key. Editable only while the category is DRAFT — publication freezes the ' +
      'address, because this contract delivers no redirect and no alias.',
  })
  slug!: string;

  @ApiProperty({ example: 'Mũ lưỡi trai', description: 'Canonical Vietnamese label.' })
  name!: string;

  @ApiProperty({
    enum: PUBLISHED_CATEGORY_STATES,
    example: 'DRAFT',
    description:
      'The lifecycle state. A category is publicly browsable in PUBLISHED and in no other ' +
      'state. This is a closed rule vocabulary, not a taxonomy.',
  })
  status!: CategoryState;

  @ApiProperty({
    example: true,
    description:
      'Whether this category may be indexed by a search engine. Independent of publication: ' +
      'a PUBLISHED category with `false` is fully browsable and simply never advertised in a ' +
      'sitemap.',
  })
  isIndexable!: boolean;

  @ApiProperty({
    example: 10,
    description:
      "The operator's editorial position, and the primary sort key of both this list and the " +
      'public inventory. Sparse: moving one category renumbers no other.',
  })
  displayOrder!: number;

  @ApiProperty({
    required: false,
    format: 'date-time',
    description: 'When the category was archived. Absent unless the category is ARCHIVED.',
  })
  archivedAt?: string;

  @ApiProperty({
    format: 'date-time',
    example: TOKEN_EXAMPLE,
    description:
      'The concurrency token. Echo it as `expectedUpdatedAt` on the next update or ' +
      'transition; a stale value is refused as `CATEGORY_VERSION_CONFLICT` rather than ' +
      'overwriting a concurrent change.',
  })
  updatedAt!: string;
}

export class AdminCategoryListItemResponse extends AdminCategoryResponse {
  @ApiProperty({
    example: 0,
    description:
      'How many PUBLISHED products currently sit in this category. Counted from the products ' +
      'themselves on every read — there is no counter column — so it is always current as of ' +
      'this response. It is a display aid: archiving re-counts the dependency inside its own ' +
      'transaction and may still refuse, whatever number this response carried.',
  })
  publishedProductCount!: number;
}

export class AdminCategoryListResponse {
  @ApiProperty({
    type: [AdminCategoryListItemResponse],
    description:
      'The complete taxonomy in every state, ordered by `displayOrder` then `slug`. Unpaged ' +
      'and unfiltered: a taxonomy too large for one response fails the request rather than ' +
      'truncating, and a screen that wants a subset filters on `status` itself.',
  })
  items!: AdminCategoryListItemResponse[];
}
