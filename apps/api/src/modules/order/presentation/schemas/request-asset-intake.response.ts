/**
 * The documented response shapes for APP5 customer intake (`APP5-B02` §4, §11).
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field an unauthenticated browser is allowed to
 * see. The runtime projections live beside their services; keeping the two in
 * one file would make it easy to add a property to the response and forget the
 * schema, or the reverse.
 *
 * Nothing here names a bucket, an object key, a checksum, a content
 * fingerprint, a customer, a challenge or an inspector. The upload's stored
 * idempotency record carries several of those because a replay needs them; none
 * of them is projected.
 */
import { ApiProperty } from '@nestjs/swagger';

import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';
import { REQUEST_INTAKE_ROLES } from '../../domain/intake/request-intake.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

export class CustomRequestAssetIntakeResponse {
  @ApiProperty({
    format: 'uuid',
    example: ASSET_ID_EXAMPLE,
    description: 'Supply this id in the submission once its state reaches ACCEPTED.',
  })
  assetId!: string;

  @ApiProperty({ enum: REQUEST_INTAKE_ROLES, example: 'REFERENCE' })
  role!: string;

  @ApiProperty({
    enum: ['INSPECTING'],
    example: 'INSPECTING',
    description:
      'Inspection has been queued, not completed. The file is not yet usable in a submission.',
  })
  state!: string;

  @ApiProperty({ enum: ACCEPTED_MEDIA_TYPES, example: 'image/png' })
  mediaType!: string;

  @ApiProperty({ description: 'Server-measured size in bytes.', example: 51_200 })
  byteSize!: number;
}

export class CustomRequestAssetStatusResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    enum: ['UPLOADED', 'INSPECTING', 'ACCEPTED', 'REJECTED'],
    example: 'ACCEPTED',
    description:
      'REJECTED is terminal: the file failed inspection or has been removed, and re-uploading ' +
      'is the only way forward.',
  })
  state!: string;

  @ApiProperty({
    example: true,
    description: 'True exactly when this id would be accepted in a custom-request submission.',
  })
  bindable!: boolean;
}
