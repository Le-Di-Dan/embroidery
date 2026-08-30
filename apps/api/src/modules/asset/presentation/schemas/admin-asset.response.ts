/**
 * The documented response shapes for the Admin asset operations.
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field a browser is allowed to see. The runtime
 * projection lives in `asset-projection.ts`; keeping the two in one file would
 * make it easy to add a property to the response and forget the schema, or the
 * reverse.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  GALLERY_ASSET_CLASSIFICATION,
  GALLERY_ASSET_KIND,
} from '../../domain/admin-asset-scope.policy';
import {
  ACCEPTED_MEDIA_TYPES,
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
} from '../../domain/asset-intake.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const CHECKSUM_EXAMPLE = `sha256:${'0'.repeat(64)}`;

export class AdminAssetUploadReceiptResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  /**
   * Both lanes are documented because the two reads are scoped
   * (`APP11-B03A` §10.1): an upload is always `CATALOG_MEDIA`, but a
   * `scope=GALLERY` read returns the prepared showcase lane. Narrowing the enum
   * to the upload's own value would make the generated client's type a lie
   * about a response it can legitimately receive.
   */
  @ApiProperty({ enum: [INTAKE_ASSET_KIND, GALLERY_ASSET_KIND], example: INTAKE_ASSET_KIND })
  kind!: string;

  @ApiProperty({
    enum: [INTAKE_CLASSIFICATION, GALLERY_ASSET_CLASSIFICATION],
    example: INTAKE_CLASSIFICATION,
  })
  classification!: string;

  @ApiProperty({
    description: 'The asset lifecycle state after the inspection handoff.',
    example: 'INSPECTING',
  })
  status!: string;

  @ApiProperty({ enum: ACCEPTED_MEDIA_TYPES, example: 'image/png' })
  mediaType!: string;

  @ApiProperty({ description: 'Server-measured size in bytes.', example: 51_200 })
  byteSize!: number;

  @ApiProperty({
    description: 'Server-computed SHA-256. No client-supplied checksum is accepted.',
    example: CHECKSUM_EXAMPLE,
  })
  checksum!: string;
}

export class AdminAssetDetailResponse extends AdminAssetUploadReceiptResponse {
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminAssetListResponse {
  @ApiProperty({ type: [AdminAssetDetailResponse] })
  items!: AdminAssetDetailResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}
