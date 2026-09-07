/**
 * Request-side validation for the five Admin product operations.
 *
 * Every schema is `.strict()`: an unknown field is a client bug worth reporting,
 * and silently dropping one is how a caller believes it set something it did
 * not. Nothing the server owns is accepted here — no slug, status, currency,
 * display order or media role — so a request cannot put a row into a state
 * publication would later have to repair.
 */
import type { ProductState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { CATEGORY_SLUG_MAX_LENGTH, CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';
import {
  MAX_BASE_PRICE_AMOUNT,
  MAX_PRODUCT_MEDIA_ITEMS,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
} from '../../domain/product-draft.policy';

/**
 * The lifecycle values the list filter accepts.
 *
 * Declared here rather than imported as a runtime value: presentation must not
 * pull the ORM schema namespace in (`BACKEND_CONVENTIONS.md` §3). The assertion
 * below is the safety net — if `ProductState` gains a member, this file stops
 * compiling instead of silently rejecting a valid filter.
 */
const PRODUCT_STATUS_FILTERS = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const satisfies readonly ProductState[];

type MissingStatus = Exclude<ProductState, (typeof PRODUCT_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingStatus = MissingStatus extends never ? true : ['missing', MissingStatus];

/** UUID path parameter — rejected before any repository call. */
export const productIdParamSchema = z.object({ productId: z.string().uuid() }).strict();

export class ProductIdParam extends createZodDto(productIdParamSchema) {}

/**
 * A VND amount in minor units, as a decimal **string**.
 *
 * Never a JSON number: `numeric(14,2)` values beyond 2^53 lose precision the
 * moment they become a JavaScript float, and money must survive the round trip
 * exactly (`CLAUDE.md` §5). VND has no minor unit, so the value is a whole
 * number of đồng and the string is digits only.
 */
const WHOLE_DONG = /^\d{1,12}$/;

const basePriceAmountSchema = z
  .string()
  .regex(WHOLE_DONG, 'A VND amount is a whole number of đồng, with no separators.')
  // The pattern is re-tested inside the refinement because Zod still runs
  // refinements after a failed check: `BigInt('250000.50')` throws a raw
  // SyntaxError, which would escape validation as a 500 rather than being
  // reported as the bad request it is.
  .refine(
    (value) => WHOLE_DONG.test(value) && BigInt(value) <= MAX_BASE_PRICE_AMOUNT,
    'That amount is too large.',
  );

const productNameSchema = z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH);

/**
 * Media selection: an ordered list of Asset ids.
 *
 * Order is the contract — position 0 becomes the `THUMBNAIL` — so the array is
 * never reordered or de-duplicated silently; a repeat is rejected in the
 * service as `PRODUCT_MEDIA_DUPLICATE`.
 *
 * The shape is unchanged by `APP12-M01.DB1`; only the published bound is new.
 * `maxItems` here is the contract's statement of the same cap the domain
 * enforces and migration 0039 installs — read from the one constant, so a
 * client that reads the schema and a service that refuses the request cannot
 * disagree about the number. The domain check is not redundant: it is the one
 * that holds for every caller, including a future write that does not pass
 * through this DTO.
 */
const mediaAssetIdsSchema = z.array(z.string().uuid()).max(MAX_PRODUCT_MEDIA_ITEMS);

/**
 * The category slug an Admin request may name (`APP12-C01`).
 *
 * A shape, not a membership. The taxonomy is dynamic and lives in
 * `categories`, so the boundary checks only that the value could be a slug at
 * all; whether it names a category that exists and is currently active is
 * `CategoryResolver`'s question, answered against rows, and still reported as
 * `PRODUCT_CATEGORY_INVALID`. Admin semantics are therefore unchanged — a bad
 * slug is refused either way — but a category the operator adds after this build
 * is no longer refused by the contract before the database is ever asked.
 */
const categorySlugSchema = z
  .string()
  .min(1)
  .max(CATEGORY_SLUG_MAX_LENGTH)
  .regex(CATEGORY_SLUG_PATTERN);

export const listProductsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(PRODUCT_STATUS_FILTERS).optional(),
    categorySlug: categorySlugSchema.optional(),
  })
  .strict();

export class ListProductsQuery extends createZodDto(listProductsQuerySchema) {}

export const createProductBodySchema = z
  .object({
    categorySlug: categorySlugSchema,
    name: productNameSchema,
    // Absent and blank are both "no description"; blank is normalised away so
    // the column never holds a value that renders as nothing.
    description: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).optional(),
  })
  .strict();

export class CreateProductBody extends createZodDto(createProductBodySchema) {}

/**
 * The patch body.
 *
 * `expectedUpdatedAt` is mandatory: it is the concurrency token, and an update
 * without one is exactly the unguarded read-then-write §10 forbids.
 *
 * Description has exactly one contract (APP2-B02-C1 §9): **absent** leaves the
 * stored value unchanged, **null or blank** clears it to NULL, anything else is
 * stored. There is no state in which a product holds a description that renders
 * as nothing.
 */
export const updateProductBodySchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    name: productNameSchema.optional(),
    description: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    basePriceAmount: basePriceAmountSchema.optional(),
    categorySlug: categorySlugSchema.optional(),
    mediaAssetIds: mediaAssetIdsSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.basePriceAmount !== undefined ||
      body.categorySlug !== undefined ||
      body.mediaAssetIds !== undefined,
    { message: 'A patch must change at least one field.' },
  );

export class UpdateProductBody extends createZodDto(updateProductBodySchema) {}

export const archiveProductBodySchema = z
  .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .strict();

export class ArchiveProductBody extends createZodDto(archiveProductBodySchema) {}

registerZodDtos(
  ProductIdParam,
  ListProductsQuery,
  CreateProductBody,
  UpdateProductBody,
  ArchiveProductBody,
);
