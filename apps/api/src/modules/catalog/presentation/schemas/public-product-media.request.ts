/**
 * Path validation for the public catalog-media route (`APP2-T01`).
 *
 * The route is anonymous, so this schema is the entire trust boundary for three
 * values that go on to address a database row and — indirectly — a private
 * object. `.strict()` as everywhere else, and every segment is constrained to a
 * shape the server itself produces: a slug the server derived, a UUID the
 * database generated, and one of two literal renditions.
 *
 * None of these values ever becomes part of an object-storage key. The key is
 * read from `asset_derivatives.storage_key`, so no amount of path manipulation
 * can reach an arbitrary object.
 */
import { z } from 'zod';

import { createZodDto } from '../../../../platform/validation';
import { SLUG_MAX_LENGTH } from '../../domain/product-slug';
import { PUBLIC_PRODUCT_MEDIA_RENDITIONS } from '../../domain/public-product-media.policy';

/**
 * The charset `deriveProductSlugBase` emits: lowercase alphanumerics in
 * hyphen-separated groups, never leading, trailing or doubled separators.
 * Matching the producer exactly means a value that could not have been minted
 * by this server is rejected before it reaches a query.
 */
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const publicProductMediaParamsSchema = z
  .object({
    slug: z.string().min(1).max(SLUG_MAX_LENGTH).regex(PRODUCT_SLUG_PATTERN),
    // `product_media.id` is a UUIDv7, but the parameter is validated as a plain
    // UUID: the version is a generation policy the database owns, and rejecting
    // a well-formed non-v7 id here would be this layer asserting a rule it does
    // not enforce. A wrong id fails the lookup safely either way.
    productMediaId: z.string().uuid(),
    rendition: z.enum(PUBLIC_PRODUCT_MEDIA_RENDITIONS),
  })
  .strict();

export class PublicProductMediaParams extends createZodDto(publicProductMediaParamsSchema) {}
