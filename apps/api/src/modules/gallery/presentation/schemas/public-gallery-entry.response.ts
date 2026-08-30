/**
 * The documented response shapes of the two public gallery reads
 * (`APP11-B03`).
 *
 * These classes exist for OpenAPI, and the generated client types come from
 * them — so every property here is a property an anonymous browser is allowed
 * to see. The runtime projection lives in `public-gallery-entry.projection.ts`;
 * keeping the two apart means adding a field to one and forgetting the other
 * surfaces as a type error rather than as a silently undocumented field.
 *
 * Deliberately absent, and asserted absent by the contract suite: any asset
 * storage key, bucket or checksum, any private original or signed URL,
 * `assets.classification`, the lifecycle `status`, `archivedAt`, the
 * `createdAt`/`updatedAt` concurrency token, the raw `linkedProductId` of a
 * product the public may not see, and `altText` — `ALT_TEXT_MODEL` is
 * `DERIVED_NOT_PERSISTED`, so accessible text is derived by the Storefront from
 * gallery-entry context and has no field here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SLUG_EXAMPLE = 'bo-suu-tap-hoa-sen';
const ASSET_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const COVER_URL_EXAMPLE = `/api/public/gallery-entries/${SLUG_EXAMPLE}/assets/${ASSET_ID_EXAMPLE}/thumbnail`;
const DETAIL_URL_EXAMPLE = `/api/public/gallery-entries/${SLUG_EXAMPLE}/assets/${ASSET_ID_EXAMPLE}/catalog-preview`;

const MEDIA_PATH_DESCRIPTION =
  'Relative application path served by the publication-gated delivery route. Never a ' +
  'storage or CDN address, never signed, and it expires with nothing — the route ' +
  're-checks publication and asset eligibility on every request.';

export class PublicGalleryEntrySummaryResponse {
  @ApiProperty({ format: 'uuid', description: 'Opaque public identity of the entry.' })
  galleryEntryId!: string;

  @ApiProperty({ example: SLUG_EXAMPLE, description: 'Immutable server-owned address.' })
  slug!: string;

  @ApiProperty({ example: 'Bộ sưu tập hoa sen' })
  title!: string;

  @ApiProperty({ example: 'Thêu tay trên vải lanh, giới hạn 12 mẫu.' })
  description!: string;

  @ApiProperty({ description: 'Editorial position; the feed is ordered by it.', example: 100 })
  displayOrder!: number;

  @ApiProperty({
    description:
      'Whether the entry may be indexed by search engines. It is **not** a visibility ' +
      'flag: a `false` entry is still listed, still readable and still media-deliverable.',
    example: true,
  })
  isIndexable!: boolean;

  @ApiProperty({
    format: 'uuid',
    description:
      'The leading image — the first currently deliverable association in the stored ' +
      'gallery order. Always present: an entry with no deliverable image is omitted ' +
      'from the feed rather than shown as a broken card.',
  })
  coverAssetId!: string;

  @ApiProperty({ description: MEDIA_PATH_DESCRIPTION, example: COVER_URL_EXAMPLE })
  coverUrl!: string;

  @ApiProperty({
    description: 'How many of the images are currently deliverable, not how many are stored.',
    example: 4,
  })
  assetCount!: number;
}

export class PublicGalleryEntryListResponse {
  @ApiProperty({ type: [PublicGalleryEntrySummaryResponse] })
  items!: PublicGalleryEntrySummaryResponse[];

  @ApiProperty({ description: 'True when another page follows.', example: false })
  hasNext!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque forward cursor, or null on the last page.',
    example: null,
  })
  nextCursor!: string | null;
}

export class PublicGalleryAssetResponse {
  @ApiProperty({
    format: 'uuid',
    description:
      'Opaque identity of the image. It is not a storage reference and grants no access ' +
      'on its own — it resolves only inside this published entry.',
  })
  assetId!: string;

  @ApiProperty({
    description:
      'Zero-based position in the curated order; 0 is the cover. Positions are ' +
      'consecutive over the images actually returned, so a withdrawn image leaves no gap.',
    example: 0,
  })
  position!: number;

  @ApiProperty({ description: MEDIA_PATH_DESCRIPTION, example: DETAIL_URL_EXAMPLE })
  url!: string;
}

export class PublicGalleryEntrySeoResponse {
  @ApiPropertyOptional({ example: 'Bộ sưu tập hoa sen thêu tay' })
  title?: string;

  @ApiPropertyOptional({ example: 'Mười hai mẫu thêu tay lấy cảm hứng từ hoa sen.' })
  description?: string;

  @ApiProperty({ description: 'Whether the entry may be indexed.', example: true })
  isIndexable!: boolean;
}

export class PublicGalleryLinkedProductResponse {
  @ApiProperty({ example: 'khan-theu-hoa-sen' })
  slug!: string;

  @ApiProperty({ example: 'Khăn thêu hoa sen' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Canonical public catalog thumbnail path; absent when there is none.',
    example:
      '/api/public/products/khan-theu-hoa-sen/media/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/thumbnail',
  })
  thumbnailUrl?: string;
}

export class PublicGalleryEntryDetailResponse {
  @ApiProperty({ format: 'uuid' })
  galleryEntryId!: string;

  @ApiProperty({ example: SLUG_EXAMPLE })
  slug!: string;

  @ApiProperty({ example: 'Bộ sưu tập hoa sen' })
  title!: string;

  @ApiProperty({ example: 'Thêu tay trên vải lanh, giới hạn 12 mẫu.' })
  description!: string;

  @ApiProperty({ example: 100 })
  displayOrder!: number;

  @ApiProperty({
    type: [PublicGalleryAssetResponse],
    description:
      'Currently deliverable images in the curated order. An image whose bytes are no ' +
      'longer servable is omitted rather than advertised with an address that would 404; ' +
      'the operator selection itself is never edited by a read.',
  })
  assets!: PublicGalleryAssetResponse[];

  @ApiProperty({
    type: PublicGalleryEntrySeoResponse,
    description:
      'Only SEO facts that physically exist on the entry. No canonical browser URL and no ' +
      'robots directive: the document head is a Storefront concern.',
  })
  seo!: PublicGalleryEntrySeoResponse;

  @ApiProperty({
    type: PublicGalleryLinkedProductResponse,
    nullable: true,
    description:
      'The linked product, **only** when it is itself publicly visible under the catalog ' +
      'publication authority. Null when there is no link and null when the linked product ' +
      'is draft, archived or otherwise non-public — the two cases are indistinguishable, ' +
      'and neither hides the gallery entry.',
  })
  linkedProduct!: PublicGalleryLinkedProductResponse | null;
}
