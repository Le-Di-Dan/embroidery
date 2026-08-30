/**
 * The documented response shape for `adminGalleryAsset_create`.
 *
 * This class exists for OpenAPI only — the generated client's types come from
 * it, so every field here is a field a browser is allowed to see. The runtime
 * projection lives in `admin-gallery-asset.projection.ts`; keeping the two in
 * one file would make it easy to add a property to the response and forget the
 * schema, or the reverse.
 */
import { ApiProperty } from '@nestjs/swagger';

import {
  GALLERY_ASSET_CLASSIFICATION,
  GALLERY_ASSET_KIND,
} from '../../../asset/domain/admin-asset-scope.policy';
import { PREPARED_GALLERY_ASSET_STATUS } from '../../domain/gallery-asset-preparation.policy';
import { PUBLIC_GALLERY_MEDIA_RENDITIONS } from '../../domain/public-gallery-media.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const CHECKSUM_EXAMPLE = `sha256:${'0'.repeat(64)}`;

export class AdminGalleryAssetRenditionResponse {
  @ApiProperty({ enum: PUBLIC_GALLERY_MEDIA_RENDITIONS, example: 'thumbnail' })
  rendition!: string;

  @ApiProperty({
    description:
      'Relative Admin path streaming this rendition. Not a storage address and not public: it ' +
      'resolves only behind a live Admin session.',
    example: `/api/admin/gallery-assets/${ASSET_ID_EXAMPLE}/thumbnail`,
  })
  url!: string;
}

export class AdminGalleryAssetResponse {
  @ApiProperty({
    format: 'uuid',
    description: 'The prepared asset. Always a new id, never the source asset.',
    example: ASSET_ID_EXAMPLE,
  })
  assetId!: string;

  @ApiProperty({ enum: [GALLERY_ASSET_KIND], example: GALLERY_ASSET_KIND })
  kind!: string;

  @ApiProperty({ enum: [GALLERY_ASSET_CLASSIFICATION], example: GALLERY_ASSET_CLASSIFICATION })
  classification!: string;

  @ApiProperty({
    enum: [PREPARED_GALLERY_ASSET_STATUS],
    description: 'Terminal on return: the copy is recorded as already inspected.',
    example: PREPARED_GALLERY_ASSET_STATUS,
  })
  status!: string;

  @ApiProperty({
    description: "The uploaded original's media type, carried from the source.",
    example: 'image/png',
  })
  mediaType!: string;

  @ApiProperty({ description: 'Size of the original in bytes.', example: 51_200 })
  byteSize!: number;

  @ApiProperty({
    description: "The source's server-computed SHA-256, true of the byte-identical copy.",
    example: CHECKSUM_EXAMPLE,
  })
  checksum!: string;

  @ApiProperty({
    type: [AdminGalleryAssetRenditionResponse],
    description: 'Every rendition ready to preview now and to serve publicly once attached.',
  })
  renditions!: AdminGalleryAssetRenditionResponse[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    format: 'date-time',
    description: "The prepared asset's own concurrency token, not the source's.",
  })
  updatedAt!: string;
}
