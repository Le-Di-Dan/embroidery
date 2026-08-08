/**
 * The documented response shapes for the two public Design Template reads
 * (`APP3-B05`).
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them — so every field here is a field an anonymous browser is allowed to see.
 * The runtime projection lives in `public-design-template.projection.ts`;
 * keeping the two apart means adding a property to one and forgetting the other
 * shows up as a type error rather than as a silently undocumented field.
 *
 * `document` reuses the **generated `APP3-P01` component**. There is exactly one
 * structural definition of a Design Document in this repository, and nothing
 * here restates a field of it: the marker below tells document assembly to
 * replace this node with a reference to it, the same mechanism `APP3-B08-C1`
 * introduced and the Admin detail read already uses.
 *
 * Deliberately absent from both shapes: `templateId`, `status`, the authoring
 * timestamps, `previewDerivativeId` and every derivative, storage key, bucket,
 * object URL, Audit reason and Outbox payload. `APP3-B05A` owns published
 * Template asset delivery and its route is not locked yet, so an id pointing at
 * bytes would be an address a client can only guess at.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

const SLUG_EXAMPLE = 'hoa-sen-co-dien';
const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

/**
 * The `document` property, carrying the `APP3-B08-C1` publication marker.
 *
 * Declared as a variable rather than inline because the marker is a vendor
 * extension and `ApiPropertyOptions` describes only the keys Swagger defines; a
 * fresh object literal would be rejected by excess-property checking even though
 * the decorator passes unknown keys straight through. The
 * `type`/`additionalProperties` pair is a placeholder — document assembly
 * replaces this whole node with a reference to the generated `DesignDocument`
 * component.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description: 'The canonical Design Document of the published version, exactly as published.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

/** The exact `product → side → area` triple this Template is compatible with. */
export class PublicDesignTemplateScopeResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  productSideId!: string;

  @ApiProperty({ format: 'uuid' })
  embroideryAreaId!: string;
}

/** The published version being offered. Never an unpublished one. */
export class PublicDesignTemplateVersionResponse {
  @ApiProperty({ example: 1, description: 'Monotonic per Template. There is no version 0.' })
  version!: number;

  @ApiProperty({ example: 1, description: 'The Design Document schema version it is governed by.' })
  documentSchemaVersion!: number;

  @ApiProperty({
    format: 'date-time',
    description:
      'Set once when this exact version was first published; never cleared or rewritten.',
  })
  publishedAt!: string;
}

export class PublicDesignTemplateSummaryResponse {
  @ApiProperty({
    description: 'The public address of this Template — server-owned and derived from its name.',
    example: SLUG_EXAMPLE,
  })
  slug!: string;

  @ApiProperty({ example: 'Hoa sen cổ điển' })
  name!: string;

  @ApiPropertyOptional({ description: 'Absent when the Template carries no description.' })
  description?: string;

  @ApiProperty({ type: PublicDesignTemplateScopeResponse })
  scope!: PublicDesignTemplateScopeResponse;

  @ApiProperty({ type: PublicDesignTemplateVersionResponse })
  publishedVersion!: PublicDesignTemplateVersionResponse;
}

export class PublicDesignTemplateDetailResponse extends PublicDesignTemplateSummaryResponse {
  @ApiProperty(DOCUMENT_PROPERTY)
  document!: unknown;
}

export class PublicDesignTemplateListResponse {
  @ApiProperty({ type: [PublicDesignTemplateSummaryResponse] })
  items!: PublicDesignTemplateSummaryResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}
