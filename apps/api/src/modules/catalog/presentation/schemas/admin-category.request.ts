/**
 * Request-side validation for the four Admin category operations
 * (`APP12-C02`).
 *
 * Every schema is `.strict()`: an unknown field is a client bug worth
 * reporting, and silently dropping one is how a caller believes it set
 * something it did not. Nothing the server owns is accepted — no `id`, no
 * `status`, no `archivedAt`, no `createdAt`/`updatedAt` beyond the concurrency
 * token — so a request cannot put a row into a state the lifecycle would later
 * have to repair.
 *
 * **No category value appears here** (`IMP-D062`). The slug rule is a *shape*,
 * imported from `domain/category-slug.ts`; which slugs exist is a question only
 * rows answer.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { CATEGORY_SLUG_MAX_LENGTH, CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';
import {
  CATEGORY_DISPLAY_ORDER_MAX,
  CATEGORY_DISPLAY_ORDER_MIN,
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_TRANSITION_ACTIONS,
} from '../../domain/admin-category.policy';

/** UUID path parameter — rejected before any repository call. */
export const categoryIdParamSchema = z.object({ categoryId: z.string().uuid() }).strict();

export class CategoryIdParam extends createZodDto(categoryIdParamSchema) {}

/**
 * The slug shape, checked at the boundary so a malformed value never reaches a
 * WHERE clause or a uniqueness arbiter.
 */
const categorySlugSchema = z
  .string()
  .min(1)
  .max(CATEGORY_SLUG_MAX_LENGTH)
  .regex(CATEGORY_SLUG_PATTERN);

/** Trimmed and non-empty: a category whose label renders as nothing is not one. */
const categoryNameSchema = z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH);

const displayOrderSchema = z
  .number()
  .int()
  .min(CATEGORY_DISPLAY_ORDER_MIN)
  .max(CATEGORY_DISPLAY_ORDER_MAX);

/**
 * The concurrency token, echoed back exactly as it was published.
 *
 * Mandatory on both mutations that act on an existing row: a write without one
 * is the unguarded read-then-write the whole design forbids.
 */
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });

/**
 * The create body.
 *
 * `isIndexable` and `displayOrder` are required rather than defaulted: the
 * column is `NOT NULL` with no database default, and a server-invented position
 * would silently place a new category at the front or the back of the operator's
 * own ordering. `status` is absent by design — every category starts `DRAFT`.
 */
export const createCategoryBodySchema = z
  .object({
    slug: categorySlugSchema,
    name: categoryNameSchema,
    isIndexable: z.boolean(),
    displayOrder: displayOrderSchema,
  })
  .strict();

export class CreateCategoryBody extends createZodDto(createCategoryBodySchema) {}

/**
 * The patch body.
 *
 * Every editable field is optional and at least one must be present: an empty
 * patch that still advanced the concurrency token would invalidate another
 * operator's in-flight edit for no change at all.
 *
 * `status` is deliberately absent. Lifecycle moves only through the transitions
 * collection, so no patch can archive or publish a category as a side effect of
 * a rename.
 */
export const updateCategoryBodySchema = z
  .object({
    expectedUpdatedAt: expectedUpdatedAtSchema,
    slug: categorySlugSchema.optional(),
    name: categoryNameSchema.optional(),
    isIndexable: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.slug !== undefined ||
      value.name !== undefined ||
      value.isIndexable !== undefined ||
      value.displayOrder !== undefined,
    { message: 'The patch must change at least one field.' },
  );

export class UpdateCategoryBody extends createZodDto(updateCategoryBodySchema) {}

/**
 * The transition body.
 *
 * The action is what the operator is *doing*; the server decides which state
 * that lands in. A body naming a target state directly would let a future second
 * path into the same state arrive with no name of its own — and would invite a
 * client to reason about the state machine the server owns.
 */
export const transitionCategoryBodySchema = z
  .object({
    expectedUpdatedAt: expectedUpdatedAtSchema,
    action: z.enum(CATEGORY_TRANSITION_ACTIONS),
  })
  .strict();

export class TransitionCategoryBody extends createZodDto(transitionCategoryBodySchema) {}

registerZodDtos(CategoryIdParam, CreateCategoryBody, UpdateCategoryBody, TransitionCategoryBody);
