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
    expectedUpdatedAt: z.string().datetime(),
    sides: z.array(sideSchema).max(20),
  })
  .strict();

export class ReplaceProductPlacementBody extends createZodDto(replaceProductPlacementSchema) {}
