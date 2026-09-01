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

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { CATEGORY_SLUG_MAX_LENGTH, CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';

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
    // The public taxonomy is **dynamic** (`APP12-C01`), so the filter validates
    // a shape rather than a membership: the set of categories is operator data
    // and a contract enum could only ever be a stale copy of it. A malformed
    // value is still rejected here and never reaches a WHERE clause; a
    // syntactically valid slug that names no public category resolves to an
    // empty page, which is the safe answer — never an unfiltered list, and never
    // an oracle telling an anonymous caller which categories exist in draft.
    categorySlug: z
      .string()
      .min(1)
      .max(CATEGORY_SLUG_MAX_LENGTH)
      .regex(CATEGORY_SLUG_PATTERN)
      .optional(),
  })
  .strict();

export const publicProductSlugParamSchema = z.object({ slug: slugSchema }).strict();

export class PublicProductListQueryDto extends createZodDto(publicProductListQuerySchema) {}
export class PublicProductSlugParam extends createZodDto(publicProductSlugParamSchema) {}

registerZodDtos(PublicProductListQueryDto, PublicProductSlugParam);
