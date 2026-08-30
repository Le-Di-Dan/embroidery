/**
 * Request validation for the two `APP11-B03A` operations.
 *
 * Both schemas are `.strict()`, so a field the server owns is a **400 refusal**
 * rather than a silently dropped input. That is the whole security shape of the
 * create body: `kind`, `classification`, `status`, `storageKey`, `bucket`,
 * `derivativeKind` and `altText` are all absent by construction, so a caller
 * cannot ask for a lane, a state, an object address or a rendition — the policy
 * decides every one of them. The client chooses only *which source* and *which
 * version of it*, which is exactly the pair an operator can legitimately know.
 *
 * The preview params are the entire trust boundary for two values that go on to
 * address a database row and — indirectly — a private object. Neither ever
 * becomes part of an object-storage key: the key is read from
 * `asset_derivatives.storage_key`, so no amount of path manipulation can reach
 * an arbitrary object.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { PUBLIC_GALLERY_MEDIA_RENDITIONS } from '../../domain/public-gallery-media.policy';

/**
 * `assets.id` is a UUIDv7, but the parameter is validated as a plain UUID: the
 * version is a generation policy the database owns, and rejecting a well-formed
 * non-v7 id here would be this layer asserting a rule it does not enforce. A
 * wrong id fails the scoped lookup safely either way.
 */
const assetIdSchema = z.string().uuid();

/**
 * The source's concurrency token, echoed back exactly as it was published.
 *
 * An offset-bearing ISO instant, the same spelling `adminAsset_detail` publishes
 * `updatedAt` in, so a client round-trips the value it was given rather than
 * reformatting it. Mandatory: a promotion without one is the unguarded
 * read-then-write the design forbids, and the bytes would be copied from a
 * source the operator may no longer be looking at.
 */
export const prepareGalleryAssetBodySchema = z
  .object({
    sourceAssetId: assetIdSchema,
    expectedSourceUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const adminGalleryAssetPreviewParamsSchema = z
  .object({
    assetId: assetIdSchema,
    rendition: z.enum(PUBLIC_GALLERY_MEDIA_RENDITIONS),
  })
  .strict();

export class PrepareGalleryAssetBody extends createZodDto(prepareGalleryAssetBodySchema) {}
export class AdminGalleryAssetPreviewParams extends createZodDto(
  adminGalleryAssetPreviewParamsSchema,
) {}

registerZodDtos(PrepareGalleryAssetBody, AdminGalleryAssetPreviewParams);
