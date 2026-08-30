/**
 * The documented response shapes for the Admin gallery operations
 * (`APP11-B01` §8.3, §10).
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field a browser is allowed to see. The runtime
 * projection lives in `admin-gallery-entry.projection.ts`.
 *
 * Deliberately absent, and each for a stated reason:
 *
 * - **`altText`** — `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` (`APP11-D01-C1`).
 *   No column, no property, no editor. Accessible image text is derived at
 *   render time from the entry title and the image position.
 * - **Any storage fact or media URL** — no key, bucket, checksum, MIME type,
 *   derivative or address. `APP11-B03` owns public gallery media delivery and
 *   `APP11-A02` reuses the existing Admin asset authority; an address invented
 *   here would be fabricated.
 * - **Publication readiness** — `APP11-B02` owns it. A readiness field here
 *   would be a second, drifting answer to a question this checkpoint does not
 *   ask.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { GALLERY_ENTRY_STATUS_FILTERS } from '../../domain/admin-gallery-entry.policy';

const GALLERY_ENTRY_ID_EXAMPLE = '019b1c2d-3e4f-7a50-9b6c-1d2e3f405162';
const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

export class AdminGalleryEntryAssetResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    description: 'The stored association position. Ordering is ascending, ties broken by id.',
    example: 0,
  })
  position!: number;
}

export class AdminGalleryEntrySummaryResponse {
  @ApiProperty({ format: 'uuid', example: GALLERY_ENTRY_ID_EXAMPLE })
  galleryEntryId!: string;

  @ApiProperty({ example: 'Áo thêu hoa sen' })
  title!: string;

  @ApiProperty({
    description: 'The public address. Chosen once on create and immutable afterwards.',
    example: 'ao-theu-hoa-sen',
  })
  slug!: string;

  @ApiProperty({
    enum: GALLERY_ENTRY_STATUS_FILTERS,
    description: 'Lifecycle state. Always DRAFT on creation; APP11-B02 owns every transition.',
    example: 'DRAFT',
  })
  status!: string;

  @ApiProperty({ description: 'Curated position in the gallery.', example: 10 })
  displayOrder!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional product this entry links to. Absent when nothing is linked.',
    example: PRODUCT_ID_EXAMPLE,
  })
  linkedProductId?: string;

  @ApiProperty({ description: 'Whether the published entry may be indexed.', example: true })
  isIndexable!: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The first associated image, when one exists. Identity only — there is no URL here.',
    example: ASSET_ID_EXAMPLE,
  })
  coverAssetId?: string;

  @ApiProperty({ description: 'How many images the entry has.', example: 3 })
  assetCount!: number;
}

export class AdminGalleryEntryDetailResponse extends AdminGalleryEntrySummaryResponse {
  @ApiProperty({ description: 'Always present; the column is NOT NULL.', example: 'Thêu tay.' })
  description!: string;

  @ApiPropertyOptional({ description: 'On PATCH, null clears it.' })
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'On PATCH, null clears it.' })
  seoDescription?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Lifecycle evidence; set only for an archived entry. Never a filter.',
  })
  archivedAt?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    type: [AdminGalleryEntryAssetResponse],
    description: 'Ordered associations. Read-only here — APP11-B02 owns every media change.',
  })
  assets!: AdminGalleryEntryAssetResponse[];
}

export class AdminGalleryEntryListResponse {
  @ApiProperty({ type: [AdminGalleryEntrySummaryResponse] })
  items!: AdminGalleryEntrySummaryResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}
