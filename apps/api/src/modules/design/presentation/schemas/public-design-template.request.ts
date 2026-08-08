/**
 * Request validation for the two public Design Template reads (`APP3-B05`).
 *
 * Both schemas are `.strict()`: an unknown query parameter is a 400, not a
 * silently ignored field. That matters more here than on an internal surface —
 * `?status=DRAFT`, `?includeArchived=true` or `?productId=…` alone must fail
 * loudly rather than look like they might have worked. There is no lifecycle
 * parameter to reject in the first place, because a public caller never chooses
 * visibility.
 *
 * The three scope ids are **all required**. `IMP-D042` PO-06 makes compatibility
 * exact triple equality with no product-wide or wildcard fallback, so a partial
 * triple has no meaning this endpoint could honour: every interpretation of it
 * matches more Templates than the caller asked for. Requiring all three refuses
 * that request at the boundary instead of resolving it into a broader query, and
 * it is `.strict()`'s counterpart — one keeps unknown dimensions out, the other
 * keeps the known one whole.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE,
  PUBLIC_DESIGN_TEMPLATE_SLUG_PATTERN,
} from '../../domain/public-design-template.policy';
import { TEMPLATE_SLUG_MAX_LENGTH } from '../../domain/design-template-slug';

const MAX_CURSOR_LENGTH = 512;

/**
 * A scope id, validated as a UUID before it reaches a `WHERE` clause.
 *
 * Every one of the three columns is a UUID key, so anything else can only ever
 * match nothing — rejecting it at the boundary keeps a malformed id from
 * arriving as a predicate that looks like a legitimately empty result.
 */
const scopeIdSchema = z.string().uuid();

export const publicDesignTemplateListQuerySchema = z
  .object({
    productId: scopeIdSchema,
    productSideId: scopeIdSchema,
    embroideryAreaId: scopeIdSchema,
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    limit: z.coerce.number().int().min(1).max(PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE).optional(),
  })
  .strict();

export const publicDesignTemplateSlugParamSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(TEMPLATE_SLUG_MAX_LENGTH)
      .regex(PUBLIC_DESIGN_TEMPLATE_SLUG_PATTERN),
  })
  .strict();

export class PublicDesignTemplateListQueryDto extends createZodDto(
  publicDesignTemplateListQuerySchema,
) {}
export class PublicDesignTemplateSlugParam extends createZodDto(
  publicDesignTemplateSlugParamSchema,
) {}

registerZodDtos(PublicDesignTemplateListQueryDto, PublicDesignTemplateSlugParam);
