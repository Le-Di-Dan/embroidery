/**
 * Request validation for the two public catalog operations (`APP2-B04`).
 *
 * Both schemas are `.strict()`: an unknown query parameter is a 400, not a
 * silently ignored field. That matters more on a public endpoint than an
 * internal one — `?status=DRAFT` or `?includeDraft=true` must fail loudly
 * rather than look like it might have worked. There is no lifecycle parameter
 * to reject in the first place, because the public caller never chooses
 * visibility.
 */
import { z } from 'zod';

import { createZodDto } from '../../../../platform/validation';
import { APP2_CATEGORY_SLUGS } from '../../domain/product-draft.policy';

/**
 * The server-owned slug vocabulary: lowercase alphanumeric groups joined by
 * single hyphens. Bounded because it reaches a WHERE clause and an index probe;
 * the pattern is the same shape `APP2-B02` generates.
 */
export const PUBLIC_PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 160;
const MAX_CURSOR_LENGTH = 512;

const slugSchema = z.string().min(1).max(MAX_SLUG_LENGTH).regex(PUBLIC_PRODUCT_SLUG_PATTERN);

export const publicProductListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    // The public taxonomy is fixed (IMP-D032), so the filter is an enum rather
    // than free text: an unknown value is rejected at the boundary instead of
    // reaching the database as a predicate that can only ever match nothing.
    categorySlug: z.enum(APP2_CATEGORY_SLUGS).optional(),
  })
  .strict();

export const publicProductSlugParamSchema = z.object({ slug: slugSchema }).strict();

export class PublicProductListQueryDto extends createZodDto(publicProductListQuerySchema) {}
export class PublicProductSlugParam extends createZodDto(publicProductSlugParamSchema) {}
