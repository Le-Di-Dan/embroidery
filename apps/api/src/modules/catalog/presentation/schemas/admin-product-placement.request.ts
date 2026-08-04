/**
 * Request-side validation for the Admin placement replace (`APP3-B01`).
 *
 * `.strict()` throughout: an unknown field is a client bug worth reporting, and
 * silently dropping one is how a caller believes it set something it did not.
 *
 * Three things are deliberately **not** accepted anywhere in this body:
 *
 * - **A parent id.** The Product comes from the path and a Side from nesting, so
 *   a request cannot re-parent a side into another Product while every foreign
 *   key stays satisfied.
 * - **A storage key, bucket, URL or checksum.** A background is chosen by Asset
 *   id; where its bytes live is the Asset module's business and never a client's.
 * - **`retiredAt` or `supersededById`.** Retirement is derived from what the
 *   request omits and from `supersedesId` on the row that replaces it, so a
 *   client cannot mark a row retired while leaving it in the payload — two live
 *   rows claiming one identity.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

import { createZodDto } from '../../../../platform/validation';
import {
  PLACEMENT_CODE,
  PLACEMENT_CODE_MAX_LENGTH,
  PLACEMENT_NAME_MAX_LENGTH,
} from '../../domain/product-placement.policy';

export const productPlacementIdParamSchema = z.object({ productId: z.string().uuid() }).strict();

export class ProductPlacementIdParam extends createZodDto(productPlacementIdParamSchema) {}

export const productSlugParamSchema = z
  .object({ slug: z.string().trim().min(1).max(200) })
  .strict();

export class ProductSlugParam extends createZodDto(productSlugParamSchema) {}

/**
 * The stable machine identity of a Side or Area.
 *
 * The same expression the schema CHECK enforces, so a code this endpoint
 * accepts cannot be rejected by the database at commit as a bare 23514.
 */
const codeSchema = z.string().regex(new RegExp(PLACEMENT_CODE)).max(PLACEMENT_CODE_MAX_LENGTH);

const nameSchema = z.string().trim().min(1).max(PLACEMENT_NAME_MAX_LENGTH);

const displayOrderSchema = z.number().int().min(0).max(10_000);

/**
 * A pixel or millimetre measurement.
 *
 * A JSON number rather than the decimal string money uses: these are
 * measurements, not currency, and `@embroidery/design-engine` — the sole owner
 * of the scale and containment rules this body is checked against (IMP-D045) —
 * works in numbers. The bound is generous but finite: an unbounded value would
 * reach `numeric` arithmetic that has no reason to entertain it.
 */
const measurementSchema = z.number().finite().positive().max(1_000_000);

/** An origin, which may legitimately be zero — a bound may start at the edge. */
const originSchema = z.number().finite().min(0).max(1_000_000);

const pixelCountSchema = z.number().int().positive().max(1_000_000);

const areaSchema = z
  .object({
    id: z.string().uuid().optional(),
    supersedesId: z.string().uuid().optional(),
    code: codeSchema,
    name: nameSchema,
    displayOrder: displayOrderSchema,
    boundXPx: originSchema,
    boundYPx: originSchema,
    boundWidthPx: measurementSchema,
    boundHeightPx: measurementSchema,
    maxWidthMm: measurementSchema.optional(),
    maxHeightMm: measurementSchema.optional(),
  })
  .strict();

const sideSchema = z
  .object({
    id: z.string().uuid().optional(),
    supersedesId: z.string().uuid().optional(),
    code: codeSchema,
    name: nameSchema,
    displayOrder: displayOrderSchema,
    backgroundAssetId: z.string().uuid(),
    imageWidthPx: pixelCountSchema,
    imageHeightPx: pixelCountSchema,
    physicalWidthMm: measurementSchema,
    physicalHeightMm: measurementSchema,
    pxPerMm: measurementSchema,
    areas: z.array(areaSchema).max(50),
  })
  .strict();

/**
 * The whole placement model for one Product.
 *
 * An **empty** side list is valid and means "this Product has no placement":
 * publication never required one (IMP-D041 PO-06), so removing placement is a
 * legitimate operation and not a malformed request. It retires every current
 * side and area rather than deleting them.
 */
export const replaceProductPlacementSchema = z
  .object({
    /**
     * The Product concurrency token the caller read (`APP3-B01-C1`).
     *
     * `datetime({ offset: true })`, which is the Catalog convention every other
     * concurrency token already uses — `UpdateProductBody`, `ArchiveProductBody`
     * and the publication bodies all spell it exactly this way. The first
     * delivery wrote a bare `datetime()` here, which silently refused a token
     * carrying an offset (`+07:00`) that the very same client could send to any
     * other Admin Product write. A concurrency token that is accepted in one
     * place and rejected in another is worse than no convention at all.
     *
     * Mandatory: an omitted token is a rejected request, never a licence to read
     * the current value and write on top of it.
     */
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    sides: z.array(sideSchema).max(20),
  })
  .strict();

/**
 * The documented shape of the replace body (`APP3-B01-C1`).
 *
 * `createZodDto` carries the Zod schema for the validation pipe and **no**
 * OpenAPI metadata, so every schema-backed body in this repository publishes as
 * an empty object — `UpdateProductBody`, `ArchiveProductBody` and the
 * publication bodies included. Runtime validation was never affected, but the
 * published contract was: a client reading the document could not see that
 * `expectedUpdatedAt` exists, let alone that it is required, and the generated
 * client typed the body as an empty object. A concurrency token the caller
 * cannot discover is not a concurrency contract.
 *
 * These declarations are metadata only. The pipe hands the handler the parsed
 * plain object, never an instance of this class, so no property here is ever
 * assigned or read at runtime — the Zod schema above remains the single source
 * of truth for what is actually accepted, and
 * `product-placement.contract.spec.ts` holds the two descriptions together.
 *
 * The fix is deliberately scoped to this body. Repairing `createZodDto` itself
 * would change five APP2 schemas belonging to accepted checkpoints, which is not
 * this correction's to do.
 */
class ReplacePlacementAreaBody {
  @ApiPropertyOptional({ format: 'uuid', description: 'Present to retain and update an area.' })
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The area of the same side this new row replaces; that row is retired.',
  })
  supersedesId?: string;

  @ApiProperty({ pattern: PLACEMENT_CODE, maxLength: PLACEMENT_CODE_MAX_LENGTH, example: 'chest' })
  code!: string;

  @ApiProperty({ maxLength: PLACEMENT_NAME_MAX_LENGTH, example: 'Ngực trái' })
  name!: string;

  @ApiProperty({ type: 'integer', minimum: 0, example: 0 })
  displayOrder!: number;

  @ApiProperty({ description: 'Canvas-space origin, in side image pixels.', example: 120 })
  boundXPx!: number;

  @ApiProperty({ example: 90 })
  boundYPx!: number;

  @ApiProperty({ example: 400 })
  boundWidthPx!: number;

  @ApiProperty({ example: 300 })
  boundHeightPx!: number;

  @ApiPropertyOptional({ description: 'Physical maximum in millimetres.', example: 80 })
  maxWidthMm?: number;

  @ApiPropertyOptional({ example: 60 })
  maxHeightMm?: number;
}

class ReplacePlacementSideBody {
  @ApiPropertyOptional({ format: 'uuid', description: 'Present to retain and update a side.' })
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The side of the same product this new row replaces; that row is retired.',
  })
  supersedesId?: string;

  @ApiProperty({ pattern: PLACEMENT_CODE, maxLength: PLACEMENT_CODE_MAX_LENGTH, example: 'front' })
  code!: string;

  @ApiProperty({ maxLength: PLACEMENT_NAME_MAX_LENGTH, example: 'Mặt trước' })
  name!: string;

  @ApiProperty({ type: 'integer', minimum: 0, example: 0 })
  displayOrder!: number;

  @ApiProperty({ format: 'uuid', description: 'The Asset whose derivative renders this side.' })
  backgroundAssetId!: string;

  @ApiProperty({ type: 'integer', example: 1000 })
  imageWidthPx!: number;

  @ApiProperty({ type: 'integer', example: 1000 })
  imageHeightPx!: number;

  @ApiProperty({ example: 200 })
  physicalWidthMm!: number;

  @ApiProperty({ example: 200 })
  physicalHeightMm!: number;

  @ApiProperty({ description: 'Must agree with both axes of this side.', example: 5 })
  pxPerMm!: number;

  @ApiProperty({ type: [ReplacePlacementAreaBody], maxItems: 50 })
  areas!: ReplacePlacementAreaBody[];
}

export class ReplaceProductPlacementBody extends createZodDto(replaceProductPlacementSchema) {
  @ApiProperty({
    format: 'date-time',
    description:
      'The Product concurrency token, exactly as the Admin placement read returned it in ' +
      '`updatedAt`. Required. A stale value is rejected as a conflict and no side or area is ' +
      'written; a successful replace returns the fresh token in the response `updatedAt`.',
    example: '2026-08-04T10:00:00.000Z',
  })
  declare expectedUpdatedAt: string;

  @ApiProperty({
    type: [ReplacePlacementSideBody],
    maxItems: 20,
    description:
      'The complete placement model. A side or area carrying an `id` is retained, one without ' +
      'is created, and one that is omitted is retired — never deleted. An empty list retires ' +
      'the whole placement.',
  })
  declare sides: ReplacePlacementSideBody[];
}
