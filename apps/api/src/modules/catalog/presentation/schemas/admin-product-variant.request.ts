/**
 * Request-side validation for the three Admin variant operations
 * (`APP12-N02.B01`).
 *
 * Every schema is `.strict()`, for the reason `APP2-B02` states once: an
 * unknown field is a client bug worth reporting, and silently dropping one is
 * how a caller believes it set something it did not.
 *
 * What is **not** accepted here is the point of the file:
 *
 * - **No `displayOrder`.** Ordering is creation order (`N02.D01` §E) and the
 *   column is `NOT NULL` with no `DEFAULT`, so the server assigns it under the
 *   write lock. A client-supplied order would be a value two concurrent
 *   requests could both claim.
 * - **No `productId` on the patch.** A variant is never moved between Products,
 *   so there is no shape in which a body can rebind one.
 * - **No id, no timestamp.** A request cannot put a row into a state the
 *   identity rule would then have to repair.
 * - **No DELETE body, because there is no DELETE.** History is kept by
 *   deactivation.
 *
 * The two labels are validated only as *strings* here. Trimming, whitespace
 * collapse, blank-to-null and the "at least one label" rule all live in
 * `product-variant.policy.ts`, so the shape the duplicate rule compares is
 * produced in exactly one place — a `.trim()` added here would silently become
 * a second normalizer the domain does not know about.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { VARIANT_DEFAULT_IS_ACTIVE } from '../../domain/product-variant.policy';

/** UUID path parameters — rejected before any repository call or lock. */
export const productVariantsParamsSchema = z.object({ productId: z.string().uuid() }).strict();

export class ProductVariantsParams extends createZodDto(productVariantsParamsSchema) {}

export const productVariantParamsSchema = z
  .object({ productId: z.string().uuid(), variantId: z.string().uuid() })
  .strict();

export class ProductVariantParams extends createZodDto(productVariantParamsSchema) {}

/**
 * One label as it may arrive.
 *
 * `null` and `''` both mean "no label" and both normalize to the same stored
 * `NULL`: a dialog with an empty text input sends the empty string, and a
 * client clearing a field sends null, and refusing either would make the same
 * operator intent depend on which the browser happened to serialise.
 */
const variantLabelSchema = z.string().nullable();

/**
 * The create body.
 *
 * `isActive` defaults to active, unlike the SKU create which demands it
 * explicitly. The SKU rule exists because a variant may hold only one
 * order-eligible SKU, so a default would silently consume the single slot; a
 * Product may hold any number of active variants and nothing is consumed.
 */
export const createProductVariantBodySchema = z
  .object({
    colorName: variantLabelSchema.optional(),
    sizeLabel: variantLabelSchema.optional(),
    isActive: z.boolean().default(VARIANT_DEFAULT_IS_ACTIVE),
  })
  .strict();

export class CreateProductVariantBody extends createZodDto(createProductVariantBodySchema) {}

/**
 * The patch body.
 *
 * At least one field must be named. The "at least one nonblank label" rule is
 * deliberately **not** enforced here: after a patch it is a property of the
 * stored row combined with the request — clearing the colour is legal when the
 * row has a size — and a schema cannot see the row. It is settled in the
 * service, against the row read under the write lock, so both operations
 * refuse for the same reason with the same code.
 */
export const updateProductVariantBodySchema = z
  .object({
    colorName: variantLabelSchema.optional(),
    sizeLabel: variantLabelSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.colorName !== undefined || body.sizeLabel !== undefined || body.isActive !== undefined,
    { message: 'A patch must change at least one field.' },
  );

export class UpdateProductVariantBody extends createZodDto(updateProductVariantBodySchema) {}

registerZodDtos(
  ProductVariantsParams,
  ProductVariantParams,
  CreateProductVariantBody,
  UpdateProductVariantBody,
);
