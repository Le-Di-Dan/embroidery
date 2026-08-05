/**
 * Path validation for the public Side-background route (`APP3-B02`).
 *
 * The route is anonymous, so this schema is the entire trust boundary for two
 * values that go on to address a database row and — indirectly — a private
 * object. `.strict()` as everywhere else, and both segments are constrained to a
 * shape the server itself produces: a slug the server derived and a placement
 * code the database's own CHECK already restricts.
 *
 * Neither value ever becomes part of an object-storage key. The key is read from
 * `asset_derivatives.storage_key`, so no amount of path manipulation can reach
 * an arbitrary object.
 */
import { z } from 'zod';

import { createZodDto } from '../../../../platform/validation';
import { SLUG_MAX_LENGTH } from '../../domain/product-slug';

/**
 * The charset `deriveProductSlugBase` emits: lowercase alphanumerics in
 * hyphen-separated groups, never leading, trailing or doubled separators.
 * Matching the producer exactly means a value that could not have been minted by
 * this server is rejected before it reaches a query.
 */
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `PLACEMENT_CODE_PATTERN` as the database enforces it on `product_sides.code`.
 * Restated rather than imported so this layer states the shape it accepts; the
 * contract spec pins the two together.
 */
const SIDE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const SIDE_CODE_MAX_LENGTH = 64;

export const publicSideBackgroundParamsSchema = z
  .object({
    slug: z.string().min(1).max(SLUG_MAX_LENGTH).regex(PRODUCT_SLUG_PATTERN),
    sideCode: z.string().min(1).max(SIDE_CODE_MAX_LENGTH).regex(SIDE_CODE_PATTERN),
  })
  .strict();

export class PublicSideBackgroundParams extends createZodDto(publicSideBackgroundParamsSchema) {}
