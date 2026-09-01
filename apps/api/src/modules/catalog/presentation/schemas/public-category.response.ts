/**
 * The documented response shape of the public category inventory (`APP12-C01`).
 *
 * These classes exist for OpenAPI, and the generated client's types come from
 * them — so every property here is a property an anonymous browser is allowed to
 * see. The runtime projection lives in `public-category.projection.ts`.
 *
 * ## A dedicated item schema, not a widened `PublicCategoryResponse`
 *
 * `PublicCategoryResponse` is the category **embedded in every Product** payload
 * — a name and a slug, which is all a product card needs. The inventory needs
 * two more facts (`isIndexable`, `displayOrder`), and adding them there would
 * put an SEO directive and an editorial sort key on every product summary, every
 * product detail and every generated type derived from them, for no consumer.
 * So the inventory gets its own item schema and the embedded one keeps its
 * shape; the only thing that changes for the embedded schema is that its `slug`
 * stops being a four-value enum.
 *
 * Deliberately absent, and asserted absent by the contract suite: the physical
 * category UUID, `description`, `seoTitle`, `seoDescription`, the lifecycle
 * `status`, `archivedAt`, `createdAt`/`updatedAt`, any product count, and any
 * absolute or browser URL — `/kham-pha?category=<slug>` is a Storefront route
 * shape and the API does not know it exists.
 */
import { ApiProperty } from '@nestjs/swagger';

import { CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';

export class PublicCategoryInventoryItemResponse {
  @ApiProperty({
    pattern: CATEGORY_SLUG_PATTERN.source,
    description:
      'The stable public key, and the value the Product category filter accepts. Dynamic: ' +
      'the set of categories is operator data, not a closed contract enum, so a consumer ' +
      'must read this inventory rather than compile a taxonomy in.',
    example: 'ao-thun',
  })
  slug!: string;

  @ApiProperty({ description: 'Canonical Vietnamese label.', example: 'Áo thun' })
  name!: string;

  @ApiProperty({
    description:
      'Whether this category may be indexed by a search engine. Not a visibility flag: a ' +
      '`false` category is listed here and remains fully browsable — it must simply not be ' +
      'advertised in a sitemap or an indexable breadcrumb.',
    example: true,
  })
  isIndexable!: boolean;

  @ApiProperty({
    description:
      "The operator's editorial position. The primary sort key of this response, published " +
      'so a consumer that re-groups or merges the list can preserve the intended order ' +
      'instead of inventing one.',
    example: 10,
  })
  displayOrder!: number;
}

export class PublicCategoryListResponse {
  @ApiProperty({
    type: [PublicCategoryInventoryItemResponse],
    description:
      'Every publicly browsable category, ordered by `displayOrder` then `slug`. Complete ' +
      'and unpaged: there is no cursor, and a taxonomy too large for one response fails the ' +
      'request rather than truncating.',
  })
  items!: PublicCategoryInventoryItemResponse[];
}
