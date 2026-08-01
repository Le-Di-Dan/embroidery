/**
 * The documented response shapes for the three publication operations.
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field a browser is allowed to see. The runtime
 * projection lives in `product-publication.projection.ts`; keeping the two apart
 * means adding a property to one and forgetting the other shows up as a type
 * error rather than as a silently undocumented field.
 *
 * Deliberately absent: the physical category id, any Asset id, kind or
 * classification, any storage key, bucket, checksum or derivative key, any
 * inspection detail, and any media URL.
 */
import { ApiProperty } from '@nestjs/swagger';

import { PRODUCT_PUBLICATION_REQUIREMENT_CODES } from '../../domain/product-publication.policy';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const UPDATED_AT_EXAMPLE = '2026-08-01T09:15:42.317Z';
const PRODUCT_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class AdminProductRequirementResponse {
  @ApiProperty({
    enum: PRODUCT_PUBLICATION_REQUIREMENT_CODES,
    description: 'A stable publication requirement code. Never contains an identifier.',
    example: 'PRODUCT_MEDIA_READY',
  })
  code!: string;

  @ApiProperty({ description: 'Whether this requirement is currently met.', example: false })
  satisfied!: boolean;
}

export class AdminProductPublicationReadinessResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ enum: PRODUCT_STATES, example: 'DRAFT' })
  status!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'The optimistic-concurrency token to echo back on a publish or unpublish.',
    example: UPDATED_AT_EXAMPLE,
  })
  updatedAt!: string;

  @ApiProperty({
    description:
      'True only when every requirement is satisfied. It does not by itself mean the ' +
      'product may be published — the lifecycle state must also allow it.',
    example: false,
  })
  eligible!: boolean;

  @ApiProperty({
    type: [AdminProductRequirementResponse],
    description:
      'The complete, closed requirement set in a stable order. Every code is always ' +
      'present, whether satisfied or not.',
  })
  requirements!: AdminProductRequirementResponse[];
}

export class AdminProductPublicationResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ description: 'Server-owned and immutable.', example: 'gau-bong-tho-trang' })
  slug!: string;

  @ApiProperty({ enum: PRODUCT_STATES, example: 'PUBLISHED' })
  status!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'The advanced concurrency token the database stored for this write.',
    example: UPDATED_AT_EXAMPLE,
  })
  updatedAt!: string;
}
