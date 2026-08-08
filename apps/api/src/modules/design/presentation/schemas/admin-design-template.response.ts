/**
 * The documented response shapes for the three Admin Design Template operations
 * (`APP3-B03`).
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field an Admin browser is allowed to see. The
 * runtime projection lives in `design-template-projection.ts`; keeping the two
 * apart means adding a property to one and forgetting the other shows up as a
 * type error rather than as a silently undocumented field.
 *
 * `currentVersion` is **optional**, and that is the whole point of this
 * checkpoint's create semantics: a header `APP3-B03` created has no version
 * until `APP3-B03A` saves one, and the absent object says so without inventing a
 * version 0. `document` is optional for the same reason and appears on detail
 * only — a list that carried every document would be an editor's payload for a
 * chooser's screen.
 *
 * Deliberately absent: `previewDerivativeId` and any derivative, storage key,
 * bucket, object URL, Outbox payload or Audit internal. `APP3-B05A` owns
 * published Template asset delivery and no address for one exists yet, so
 * publishing a derivative id here would be an identifier a client can do nothing
 * with except guess at.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';
import { DESIGN_TEMPLATE_STATUS_FILTERS } from './admin-design-template.request';

const TEMPLATE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
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
 * component. There is exactly one structural definition of a Design Document in
 * this repository and nothing here restates a field of it.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description: 'The canonical Design Document of the current version.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

/** The exact `product → side → area` triple, present only as a whole (PO-06). */
export class AdminDesignTemplateScopeResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  productSideId!: string;

  @ApiProperty({ format: 'uuid' })
  embroideryAreaId!: string;
}

/** The highest version this Template holds. Absent means it holds none. */
export class AdminDesignTemplateVersionResponse {
  @ApiProperty({ example: 1, description: 'Monotonic per Template. There is no version 0.' })
  version!: number;

  @ApiProperty({ example: 1, description: 'The Design Document schema version it is governed by.' })
  documentSchemaVersion!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Set once when this exact version is first published; never cleared.',
  })
  publishedAt?: string;
}

export class AdminDesignTemplateSummaryResponse {
  @ApiProperty({ format: 'uuid', example: TEMPLATE_ID_EXAMPLE })
  templateId!: string;

  @ApiProperty({ example: 'Hoa sen cổ điển' })
  name!: string;

  @ApiProperty({
    description: 'Server-owned public address, derived from the name.',
    example: 'hoa-sen-co-dien',
  })
  slug!: string;

  @ApiProperty({ enum: DESIGN_TEMPLATE_STATUS_FILTERS, example: 'DRAFT' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: AdminDesignTemplateScopeResponse,
    description:
      'Absent while the draft is authored without a placement. Present only as a complete triple.',
  })
  scope?: AdminDesignTemplateScopeResponse;

  @ApiPropertyOptional({
    type: AdminDesignTemplateVersionResponse,
    description:
      'The highest version. Absent for a header that has no version yet, which is every template ' +
      'until its first document save. Not carried on the list page.',
  })
  currentVersion?: AdminDesignTemplateVersionResponse;

  @ApiPropertyOptional({ format: 'date-time', description: 'Set only for an archived template.' })
  archivedAt?: string;
}

export class AdminDesignTemplateDetailResponse extends AdminDesignTemplateSummaryResponse {
  @ApiPropertyOptional({ description: 'Absent when the draft has no description.' })
  description?: string;

  @ApiPropertyOptional(DOCUMENT_PROPERTY)
  document?: unknown;
}

export class AdminDesignTemplateListResponse {
  @ApiProperty({ type: [AdminDesignTemplateSummaryResponse] })
  items!: AdminDesignTemplateSummaryResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}
