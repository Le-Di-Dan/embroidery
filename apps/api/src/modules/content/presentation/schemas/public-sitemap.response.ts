/**
 * The documented response shape of the public SEO inventory (`APP11-B04`).
 *
 * These classes exist for OpenAPI, and the generated client types come from
 * them — so every property here is a property an anonymous crawler-facing
 * consumer is allowed to see. The runtime projection lives in
 * `public-sitemap.projection.ts`; keeping the two apart means adding a field to
 * one and forgetting the other surfaces as a type error rather than as a
 * silently undocumented field.
 *
 * Deliberately absent, and asserted absent by the contract suite: any title,
 * description or SEO text, `isIndexable`, the lifecycle `status`, any product
 * or gallery-entry id, `linkedProductId`, the category, any asset or storage
 * fact, `priority`, `changefreq`, and any absolute or browser URL.
 */
import { ApiProperty } from '@nestjs/swagger';

import { PUBLIC_SITEMAP_ENTRY_KINDS } from '../../domain/public-sitemap.policy';

export class PublicSitemapEntryResponse {
  @ApiProperty({
    enum: PUBLIC_SITEMAP_ENTRY_KINDS,
    description:
      'Which dynamic entity family the slug belongs to. Closed to these two values: the ' +
      'consumer maps a kind to its own browser route, and a third kind is a contract change.',
    example: 'PRODUCT',
  })
  kind!: (typeof PUBLIC_SITEMAP_ENTRY_KINDS)[number];

  @ApiProperty({
    description:
      'The immutable server-owned address segment. Not a path and not a URL — the ' +
      'Storefront owns the route shape and composes the browser URL itself.',
    example: 'khan-theu-hoa-sen',
  })
  slug!: string;

  @ApiProperty({
    format: 'date-time',
    description:
      "The entity's own last-modified instant, for `<lastmod>`. Never the request time and " +
      'never derived from stored objects, so an unchanged page reports an unchanged stamp.',
    example: '2026-08-30T09:15:00.000Z',
  })
  updatedAt!: string;
}

export class PublicSitemapListResponse {
  @ApiProperty({
    type: [PublicSitemapEntryResponse],
    description:
      'The complete current inventory, ordered by kind then slug. Never partial: an ' +
      'inventory too large for one response fails the request rather than truncating.',
  })
  items!: PublicSitemapEntryResponse[];
}
