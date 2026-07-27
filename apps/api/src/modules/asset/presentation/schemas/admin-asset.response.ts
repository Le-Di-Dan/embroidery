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

import { ACCEPTED_MEDIA_TYPES } from '../../domain/asset-intake.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const CHECKSUM_EXAMPLE = `sha256:${'0'.repeat(64)}`;

export class AdminAssetUploadReceiptResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({ enum: ['CATALOG_MEDIA'], example: 'CATALOG_MEDIA' })
  kind!: string;

  @ApiProperty({ enum: ['PRODUCTION_SENSITIVE'], example: 'PRODUCTION_SENSITIVE' })
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
