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
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
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

/**
 * The published documentation lives on the schema itself (`APP3-P03`).
 *
 * `.meta()` is metadata Zod carries through `toJSONSchema`, so the description a
 * client reads and the rule the server enforces are two renderings of one
 * object. `id` gives the sub-schema its OpenAPI component name, keeping the
 * generated client's `ReplacePlacementSideBody` and `ReplacePlacementAreaBody`
 * types exactly where `APP3-B01-C1` put them.
 */
const areaSchema = z
  .object({
    id: z.string().uuid().meta({ description: 'Present to retain and update an area.' }).optional(),
    supersedesId: z
      .string()
      .uuid()
      .meta({
        description: 'The area of the same side this new row replaces; that row is retired.',
      })
      .optional(),
    code: codeSchema.meta({ example: 'chest' }),
    name: nameSchema.meta({ example: 'Ngực trái' }),
    displayOrder: displayOrderSchema.meta({ example: 0 }),
    boundXPx: originSchema.meta({
      description: 'Canvas-space origin, in side image pixels.',
      example: 120,
    }),
    boundYPx: originSchema.meta({ example: 90 }),
    boundWidthPx: measurementSchema.meta({ example: 400 }),
    boundHeightPx: measurementSchema.meta({ example: 300 }),
    maxWidthMm: measurementSchema
      .meta({ description: 'Physical maximum in millimetres.', example: 80 })
      .optional(),
    maxHeightMm: measurementSchema.meta({ example: 60 }).optional(),
  })
  .strict()
  .meta({ id: 'ReplacePlacementAreaBody' });

const sideSchema = z
  .object({
    id: z.string().uuid().meta({ description: 'Present to retain and update a side.' }).optional(),
    supersedesId: z
      .string()
      .uuid()
      .meta({
        description: 'The side of the same product this new row replaces; that row is retired.',
      })
      .optional(),
    code: codeSchema.meta({ example: 'front' }),
    name: nameSchema.meta({ example: 'Mặt trước' }),
    displayOrder: displayOrderSchema.meta({ example: 0 }),
    backgroundAssetId: z
      .string()
      .uuid()
      .meta({ description: 'The Asset whose derivative renders this side.' }),
    imageWidthPx: pixelCountSchema.meta({ example: 1000 }),
    imageHeightPx: pixelCountSchema.meta({ example: 1000 }),
    physicalWidthMm: measurementSchema.meta({ example: 200 }),
    physicalHeightMm: measurementSchema.meta({ example: 200 }),
    pxPerMm: measurementSchema.meta({
      description: 'Must agree with both axes of this side.',
      example: 5,
    }),
    areas: z.array(areaSchema).max(50),
  })
  .strict()
  .meta({ id: 'ReplacePlacementSideBody' });

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
    expectedUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .meta({
        description:
          'The Product concurrency token, exactly as the Admin placement read returned it in ' +
          '`updatedAt`. Required. A stale value is rejected as a conflict and no side or area is ' +
          'written; a successful replace returns the fresh token in the response `updatedAt`.',
        example: '2026-08-04T10:00:00.000Z',
      }),
    sides: z
      .array(sideSchema)
      .max(20)
      .meta({
        description:
          'The complete placement model. A side or area carrying an `id` is retained, one without ' +
          'is created, and one that is omitted is retired — never deleted. An empty list retires ' +
          'the whole placement.',
      }),
  })
  .strict();

/**
 * The replace body's DTO (`APP3-B01-C1`, published by `APP3-P03`).
 *
 * The class carries only the Zod schema. Its published OpenAPI schema — fields,
 * required list, formats, bounds, nested sides and areas, descriptions and
 * examples — is converted from that same schema when the document is built, so
 * there is exactly one description of what this endpoint accepts. The pipe hands
 * the handler the parsed plain object and never an instance of this class.
 */
export class ReplaceProductPlacementBody extends createZodDto(replaceProductPlacementSchema) {}

registerZodDtos(ProductPlacementIdParam, ProductSlugParam, ReplaceProductPlacementBody);
