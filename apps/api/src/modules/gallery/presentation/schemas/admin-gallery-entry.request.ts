/**
 * Request-side validation for the four Admin gallery operations
 * (`APP11-B01` §6.3).
 *
 * Every schema is `.strict()`: an unknown field is a client bug worth
 * reporting, and silently dropping one is how a caller believes it set
 * something it did not. That is what makes the forbidden inputs *refusals*
 * rather than omissions — `status`, `archivedAt`, `assetIds`, `altText`,
 * `category`, `style`, `need`, `createdAt` and `updatedAt` are rejected at the
 * boundary with a 400, and `slug` is rejected on PATCH for the same reason.
 *
 * Nothing the server owns is accepted: a request cannot put an entry into a
 * state `APP11-B02`'s publication would later have to repair.
 */
import type { GalleryEntryState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  GALLERY_ENTRY_DESCRIPTION_MAX_LENGTH,
  GALLERY_ENTRY_DISPLAY_ORDER_MAX,
  GALLERY_ENTRY_DISPLAY_ORDER_MIN,
  GALLERY_ENTRY_SEO_DESCRIPTION_MAX_LENGTH,
  GALLERY_ENTRY_SEO_TITLE_MAX_LENGTH,
  GALLERY_ENTRY_SLUG_MAX_LENGTH,
  GALLERY_ENTRY_SLUG_PATTERN,
  GALLERY_ENTRY_STATUS_FILTERS,
  GALLERY_ENTRY_TITLE_MAX_LENGTH,
} from '../../domain/admin-gallery-entry.policy';

/**
 * The lifecycle values the list filter accepts, restated as literals because
 * presentation must not pull the ORM schema namespace in
 * (`BACKEND_CONVENTIONS.md` §3). The policy module holds the exhaustiveness
 * proof.
 */
const STATUS_FILTERS = GALLERY_ENTRY_STATUS_FILTERS satisfies readonly GalleryEntryState[];

/** UUID path parameter — rejected before any repository call. */
export const galleryEntryIdParamSchema = z.object({ galleryEntryId: z.string().uuid() }).strict();

export class GalleryEntryIdParam extends createZodDto(galleryEntryIdParamSchema) {}

const titleSchema = z.string().trim().min(1).max(GALLERY_ENTRY_TITLE_MAX_LENGTH);

/**
 * `gallery_entries.description` is `NOT NULL`, so there is no "absent" case to
 * model: an entry always has a description, even an empty one, and a nullable
 * spelling here would promise a state the column cannot hold.
 */
const descriptionSchema = z.string().max(GALLERY_ENTRY_DESCRIPTION_MAX_LENGTH);

/**
 * The canonical public slug grammar. Accepted on create only: the slug is the
 * public address `/bo-suu-tap/{slug}` will be served at, and rewriting it would
 * break every link that already pointed at the entry.
 */
const slugSchema = z
  .string()
  .min(1)
  .max(GALLERY_ENTRY_SLUG_MAX_LENGTH)
  .regex(GALLERY_ENTRY_SLUG_PATTERN);

const displayOrderSchema = z
  .number()
  .int()
  .min(GALLERY_ENTRY_DISPLAY_ORDER_MIN)
  .max(GALLERY_ENTRY_DISPLAY_ORDER_MAX);

const seoTitleSchema = z.string().max(GALLERY_ENTRY_SEO_TITLE_MAX_LENGTH);
const seoDescriptionSchema = z.string().max(GALLERY_ENTRY_SEO_DESCRIPTION_MAX_LENGTH);

export const listGalleryEntriesQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(STATUS_FILTERS).optional(),
  })
  .strict();

export class ListGalleryEntriesQuery extends createZodDto(listGalleryEntriesQuerySchema) {}

/**
 * The create body.
 *
 * `status` is deliberately absent: creation is always `DRAFT`, and a field the
 * schema does not declare is rejected by `.strict()` rather than ignored, so a
 * caller cannot believe it chose a lifecycle state.
 */
export const createGalleryEntryBodySchema = z
  .object({
    title: titleSchema,
    slug: slugSchema,
    description: descriptionSchema,
    displayOrder: displayOrderSchema,
    isIndexable: z.boolean(),
    linkedProductId: z.string().uuid().optional(),
    seoTitle: seoTitleSchema.optional(),
    seoDescription: seoDescriptionSchema.optional(),
  })
  .strict();

export class CreateGalleryEntryBody extends createZodDto(createGalleryEntryBodySchema) {}

/**
 * The patch body.
 *
 * `slug`, `status`, `archivedAt` and any asset field are absent by
 * construction, so a rename, a publication, an archival and a media change are
 * all unrepresentable here — `.strict()` turns each into a 400 rather than a
 * silent no-op.
 *
 * The three nullable fields have exactly one contract: **absent** leaves the
 * stored value unchanged, **null** clears it. `linkedProductId: null` is how an
 * operator unlinks a product.
 */
export const updateGalleryEntryBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    displayOrder: displayOrderSchema.optional(),
    isIndexable: z.boolean().optional(),
    linkedProductId: z.string().uuid().nullable().optional(),
    seoTitle: seoTitleSchema.nullable().optional(),
    seoDescription: seoDescriptionSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.title !== undefined ||
      body.description !== undefined ||
      body.displayOrder !== undefined ||
      body.isIndexable !== undefined ||
      body.linkedProductId !== undefined ||
      body.seoTitle !== undefined ||
      body.seoDescription !== undefined,
    { message: 'A patch must change at least one field.' },
  );

export class UpdateGalleryEntryBody extends createZodDto(updateGalleryEntryBodySchema) {}

registerZodDtos(
  GalleryEntryIdParam,
  ListGalleryEntriesQuery,
  CreateGalleryEntryBody,
  UpdateGalleryEntryBody,
);
