/**
 * Request-side validation for the two Admin SKU operations (`APP7-B01`).
 *
 * Every schema is `.strict()`, for the reason `APP2-B02` states once: an unknown
 * field is a client bug worth reporting, and silently dropping one is how a
 * caller believes it set something it did not.
 *
 * What is **not** accepted here is the point of the file. No `productVariantId`
 * on the patch — SKU ownership is immutable in this checkpoint, so there is no
 * shape in which a body can move a SKU to another variant. No `currencyCode` —
 * `ck_skus__currency_allowed` fixes it to VND and the server writes it. No id,
 * no timestamp, no `createdAt`: a request cannot put a row into a state the
 * order-eligibility rule would then have to repair.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  MAX_SKU_PRICE_OVERRIDE_AMOUNT,
  SKU_CODE_MAX_LENGTH,
  SKU_CODE_PATTERN,
} from '../../domain/product-sku.policy';

/** UUID path parameters — rejected before any repository call or lock. */
export const createSkuParamsSchema = z
  .object({ productId: z.string().uuid(), variantId: z.string().uuid() })
  .strict();

export class CreateSkuParams extends createZodDto(createSkuParamsSchema) {}

export const skuIdParamSchema = z.object({ skuId: z.string().uuid() }).strict();

export class SkuIdParam extends createZodDto(skuIdParamSchema) {}

/**
 * The business SKU code.
 *
 * Not trimmed, not upper-cased, not normalised in any way: `CST-012` compares
 * the column bytewise, so anything this layer "fixed" would be stored as a
 * different identifier from the one the Admin typed. The pattern only rules out
 * shapes that make a bytewise-exact identifier dangerous — whitespace and
 * invisible characters, which produce two codes a human reads as one.
 */
const skuCodeSchema = z
  .string()
  .min(1)
  .max(SKU_CODE_MAX_LENGTH)
  .regex(
    SKU_CODE_PATTERN,
    'A SKU code starts with a letter or digit and may then contain letters, digits, dots, hyphens and underscores.',
  );

/**
 * A VND amount in minor units, as a decimal **string**.
 *
 * Never a JSON number, for the reason `APP2-B02` states: `numeric(14,2)` values
 * beyond 2^53 lose precision the moment they become a JavaScript float, and
 * money must survive the round trip exactly (`CLAUDE.md` §5). VND has no minor
 * unit, so the value is a whole number of đồng and the string is digits only —
 * which is also what keeps `ck_skus__currency_scale` unreachable from here.
 */
const WHOLE_DONG = /^\d{1,12}$/;

const priceOverrideAmountSchema = z
  .string()
  .regex(WHOLE_DONG, 'A VND amount is a whole number of đồng, with no separators.')
  // Re-tested inside the refinement because Zod still runs refinements after a
  // failed check: `BigInt('1.5')` throws a raw SyntaxError, which would escape
  // validation as a 500 rather than being reported as the bad request it is.
  .refine(
    (value) => WHOLE_DONG.test(value) && BigInt(value) <= MAX_SKU_PRICE_OVERRIDE_AMOUNT,
    'That amount is too large.',
  );

/**
 * The create body.
 *
 * `isActive` is explicit rather than server-defaulted to `true`. Defaulting it
 * would make a second SKU on a variant impossible to author — the first would
 * always hold the single order-eligible slot — and would hide the one decision
 * that determines whether the variant becomes orderable.
 */
export const createSkuBodySchema = z
  .object({
    code: skuCodeSchema,
    priceOverrideAmount: priceOverrideAmountSchema.optional(),
    isActive: z.boolean(),
  })
  .strict();

export class CreateSkuBody extends createZodDto(createSkuBodySchema) {}

/**
 * The patch body.
 *
 * `priceOverrideAmount` has exactly one contract: **absent** leaves the stored
 * value unchanged, **null** clears it to NULL so the product base price applies
 * again, and a string sets it. There is no blank-string case — a price is not
 * free text.
 */
export const updateSkuBodySchema = z
  .object({
    code: skuCodeSchema.optional(),
    priceOverrideAmount: priceOverrideAmountSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.code !== undefined ||
      body.priceOverrideAmount !== undefined ||
      body.isActive !== undefined,
    { message: 'A patch must change at least one field.' },
  );

export class UpdateSkuBody extends createZodDto(updateSkuBodySchema) {}

registerZodDtos(CreateSkuParams, SkuIdParam, CreateSkuBody, UpdateSkuBody);
