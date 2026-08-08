/**
 * The one published shape every public Design Session operation answers with
 * (`APP3-P04`).
 *
 * Bootstrap, resume and autosave all return the value of a single function —
 * `toSessionSnapshot` — so they get a single published component. Three
 * hand-written copies of the same shape is how one of them gains a field and the
 * other two silently stop describing what they return.
 *
 * `scope` and `lineage` are optional here because they are optional at runtime,
 * not as a convenience: bootstrap resolves the placement from the slug and codes
 * the caller supplied so it can return the manifest, resume knows only internal
 * row ids and returns none, and autosave returns neither. Publishing them as
 * required would describe a response the API never sends.
 *
 * `document` references the generated `APP3-P01` component graph through the
 * `APP3-B08-C1` marker. That is the whole point: there is exactly one structural
 * definition of a Design Document in this repository, it is derived from P01's
 * TypeScript types, and nothing here restates a field of it.
 *
 * What is absent is the contract: no secret, no digest, no pepper, no cookie, no
 * storage key or URL, no idempotency scope key, no network key, no private
 * Template Version id, no customer identity and no rate-limit metadata. The Side
 * and Area ids inside `scope` are the same public identifiers the placement
 * manifest already publishes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

const SESSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/**
 * The `document` property, carrying the `APP3-B08-C1` publication marker.
 *
 * Declared as a variable rather than inline because the marker is a vendor
 * extension and `ApiPropertyOptions` describes only the keys Swagger itself
 * defines; a fresh object literal would be rejected by excess-property checking
 * even though the decorator passes unknown keys straight through into the
 * schema. The `type`/`additionalProperties` pair is a placeholder — document
 * assembly replaces this whole node with a reference to the generated
 * `DesignDocument` component, and the gate fails if it does not, so nothing here
 * can quietly become the published shape.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description: 'The canonical, quantized Design Document as persisted.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

/** The canvas and safe-area geometry a Studio needs for the first render. */
export class DesignSessionScopeResponse {
  @ApiProperty({ example: 'ao-thun-co-tron', description: 'Public Product slug.' })
  productSlug!: string;

  @ApiProperty({ example: 'front', description: 'Stable Product Side code.' })
  sideCode!: string;

  @ApiProperty({ example: 'chest', description: 'Stable Embroidery Area code.' })
  areaCode!: string;

  @ApiProperty({ example: 1000, description: 'Side image width in canvas pixels.' })
  canvasWidthPx!: number;

  @ApiProperty({ example: 1200, description: 'Side image height in canvas pixels.' })
  canvasHeightPx!: number;

  @ApiProperty({ example: 400, description: 'Physical width of the Side in millimetres.' })
  physicalWidthMm!: number;

  @ApiProperty({ example: 480, description: 'Physical height of the Side in millimetres.' })
  physicalHeightMm!: number;

  @ApiProperty({
    example: 2.5,
    description: 'The sole px↔mm conversion authority for this Side.',
  })
  pxPerMm!: number;

  @ApiProperty({ example: 100, description: 'Safe-area left edge, in canvas pixels.' })
  boundXPx!: number;

  @ApiProperty({ example: 150, description: 'Safe-area top edge, in canvas pixels.' })
  boundYPx!: number;

  @ApiProperty({ example: 400, description: 'Safe-area width, in canvas pixels.' })
  boundWidthPx!: number;

  @ApiProperty({ example: 300, description: 'Safe-area height, in canvas pixels.' })
  boundHeightPx!: number;
}

/** Template provenance. A public slug and an integer stamp — never a row id. */
export class DesignSessionLineageResponse {
  @ApiProperty({ example: 'hoa-sen-co-dien', description: 'Public Design Template slug.' })
  templateSlug!: string;

  @ApiProperty({ example: 3, description: 'The published Template version cloned.' })
  templateVersion!: number;
}

export class DesignSessionSnapshotResponse {
  @ApiProperty({ format: 'uuid', example: SESSION_ID_EXAMPLE })
  sessionId!: string;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Design Session lifecycle state.',
  })
  status!: string;

  @ApiProperty({
    example: 4,
    description: 'The autosave revision. Present it on the next mutation.',
  })
  revision!: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-07T09:15:00.000Z',
    description: 'Absolute 30-day expiry. Never extended by reading or saving.',
  })
  expiresAt!: string;

  @ApiProperty({
    example: 1,
    description: 'The Design Document schema version this snapshot is governed by.',
  })
  documentSchemaVersion!: number;

  @ApiProperty(DOCUMENT_PROPERTY)
  document!: unknown;

  @ApiPropertyOptional({
    type: DesignSessionScopeResponse,
    description:
      'Placement geometry. Present on bootstrap, which resolved it from the public slug and ' +
      'codes; absent on resume and autosave, which address the session by id.',
  })
  scope?: DesignSessionScopeResponse;

  @ApiPropertyOptional({
    type: DesignSessionLineageResponse,
    description: 'Present only when the session was cloned from a published Template.',
  })
  lineage?: DesignSessionLineageResponse;
}
