/**
 * The documented response shape for the Session upload (`APP3-B06B` §12).
 *
 * This class exists for OpenAPI only — the generated client's types come from
 * it, so every field here is a field an anonymous browser is allowed to see.
 * The runtime projection lives in `session-asset-projection.ts`; keeping the two
 * in one file would make it easy to add a property to the response and forget
 * the schema, or the reverse.
 */
import { ApiProperty } from '@nestjs/swagger';

import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const ASSOCIATION_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';

export class DesignSessionAssetIntakeResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    format: 'uuid',
    example: ASSOCIATION_ID_EXAMPLE,
    description:
      'The session↔asset association. Stable across replays of the same upload, and the ' +
      'reference normalization is requested against.',
  })
  designSessionAssetId!: string;

  @ApiProperty({
    description: 'The session revision after this upload. Supply it on the next mutation.',
    example: 4,
  })
  sessionRevision!: number;

  @ApiProperty({
    enum: ['INSPECTING'],
    example: 'INSPECTING',
    description:
      'Inspection and normalization have been queued, not completed. No derivative exists yet.',
  })
  assetStatus!: string;

  @ApiProperty({ enum: ACCEPTED_MEDIA_TYPES, example: 'image/png' })
  mediaType!: string;

  @ApiProperty({ description: 'Server-measured size in bytes.', example: 51_200 })
  byteSize!: number;
}
