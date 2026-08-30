/**
 * Request-side validation for the three `APP11-B02` operations.
 *
 * Every schema is `.strict()`, so a field the server owns is a **400 refusal**
 * rather than a silently dropped input. In particular `status`, `archivedAt`,
 * `altText`, `position`, `displayOrder` and `role` are all absent by
 * construction: the lifecycle state is decided by which operation was called,
 * an image's position is its index in `assetIds`, and per-image alt text has no
 * column to be stored in (`ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`,
 * `APP11-D01-C1`).
 *
 * All three carry `expectedUpdatedAt`, the repository's established body-based
 * concurrency token (`APP2-B03`). Mandatory on each: a media replacement or a
 * lifecycle transition without one is the unguarded read-then-write the whole
 * design forbids.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The concurrency token, echoed back exactly as it was published.
 *
 * An offset-bearing ISO instant, the same spelling the Admin detail response
 * publishes `updatedAt` in, so a client round-trips the value it was given
 * rather than reformatting it.
 */
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });

/**
 * The ordered selection.
 *
 * Ordered and complete: position 0 is the cover, and the array *replaces* the
 * stored selection rather than adding to it. An empty array is accepted and
 * means "this entry has no images" — a legitimate authoring state that only
 * publication readiness refuses.
 *
 * There is no maximum here. A cap would be an invented product rule with no
 * authority behind it; the platform's JSON body limit is the real transport
 * bound, and the repository resolves the whole selection in one statement, so
 * length costs no extra round trip. Duplicates are refused by the use case,
 * which reports them as `GALLERY_ENTRY_ASSET_DUPLICATE` rather than silently
 * collapsing a selection the operator arranged by hand.
 */
export const replaceGalleryEntryAssetsBodySchema = z
  .object({
    assetIds: z.array(z.string().uuid()),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

export class ReplaceGalleryEntryAssetsBody extends createZodDto(
  replaceGalleryEntryAssetsBodySchema,
) {}

/**
 * Both publication commands carry exactly one field.
 *
 * No reason, no publish date, no status: everything else about the transition
 * is server-owned, and accepting a field the server decides is how a request
 * puts a row into a state the lifecycle would later have to repair.
 */
export const galleryEntryPublicationBodySchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export class PublishGalleryEntryBody extends createZodDto(galleryEntryPublicationBodySchema) {}

export class UnpublishGalleryEntryBody extends createZodDto(galleryEntryPublicationBodySchema) {}

// Publish and unpublish publish the same one-field body under their own
// component name; the registry accepts a shared schema, never two different
// ones under one name.
registerZodDtos(ReplaceGalleryEntryAssetsBody, PublishGalleryEntryBody, UnpublishGalleryEntryBody);
