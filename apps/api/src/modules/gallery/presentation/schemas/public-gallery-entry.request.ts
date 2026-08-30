/**
 * Request validation for the three public gallery operations (`APP11-B03`).
 *
 * Every schema is `.strict()`: an unknown query parameter is a 400, not a
 * silently ignored field. That matters more on a public endpoint than an
 * internal one — `?status=DRAFT` or `?includeDraft=true` must fail loudly
 * rather than look like it might have worked. There is no lifecycle parameter
 * to reject in the first place, because the public caller never chooses
 * visibility.
 *
 * The media params are the entire trust boundary for three values that go on to
 * address a database row and — indirectly — a private object. Each segment is
 * constrained to a shape the server itself produces: a slug the operator minted
 * under the canonical grammar, a UUID the database generated, and one of the
 * two canonical public renditions. None of these values ever becomes part of an
 * object-storage key; the key is read from `asset_derivatives.storage_key`, so
 * no amount of path manipulation can reach an arbitrary object.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  GALLERY_ENTRY_SLUG_MAX_LENGTH,
  GALLERY_ENTRY_SLUG_PATTERN,
} from '../../domain/public-gallery-entry.policy';
import { PUBLIC_GALLERY_MEDIA_RENDITIONS } from '../../domain/public-gallery-media.policy';

const MAX_CURSOR_LENGTH = 512;
const MAX_LIMIT = 100;

const slugSchema = z
  .string()
  .min(1)
  .max(GALLERY_ENTRY_SLUG_MAX_LENGTH)
  .regex(GALLERY_ENTRY_SLUG_PATTERN);

export const publicGalleryEntryListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

export const publicGalleryEntrySlugParamSchema = z.object({ slug: slugSchema }).strict();

export const publicGalleryMediaParamsSchema = z
  .object({
    slug: slugSchema,
    // `assets.id` is a UUIDv7, but the parameter is validated as a plain UUID:
    // the version is a generation policy the database owns, and rejecting a
    // well-formed non-v7 id here would be this layer asserting a rule it does
    // not enforce. A wrong id fails the lookup safely either way.
    assetId: z.string().uuid(),
    rendition: z.enum(PUBLIC_GALLERY_MEDIA_RENDITIONS),
  })
  .strict();

export class PublicGalleryEntryListQueryDto extends createZodDto(
  publicGalleryEntryListQuerySchema,
) {}
export class PublicGalleryEntrySlugParam extends createZodDto(publicGalleryEntrySlugParamSchema) {}
export class PublicGalleryMediaParams extends createZodDto(publicGalleryMediaParamsSchema) {}

registerZodDtos(
  PublicGalleryEntryListQueryDto,
  PublicGalleryEntrySlugParam,
  PublicGalleryMediaParams,
);
