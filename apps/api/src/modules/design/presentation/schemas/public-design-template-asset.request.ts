/**
 * Path validation for published Template asset delivery (`APP3-B05A`).
 *
 * `.strict()`, like both `APP3-B05` schemas: an unknown path field is a 400, not
 * a silently ignored one. There is no query object and no body at all — no size
 * parameter, no format parameter, no `?variant=original`. A rendition selector is
 * not merely unimplemented here; it is absent, because the one deliverable
 * artifact is the canonical `NORMALIZED` derivative and any parameter that could
 * choose between artifacts is a parameter that could eventually choose the
 * private original.
 *
 * The slug pattern is `APP3-B05`'s, reused rather than restated: two public
 * routes that disagreed about what a slug looks like would be two different
 * answers to the same address.
 *
 * `version` is a positive integer, bounded. Rejecting a malformed one at the
 * boundary keeps it from arriving as a predicate that matches nothing, which
 * would be indistinguishable from a Version that legitimately is not public.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { PUBLIC_DESIGN_TEMPLATE_SLUG_PATTERN } from '../../domain/public-design-template.policy';
import { PUBLIC_TEMPLATE_ASSET_MAX_VERSION } from '../../domain/public-design-template-asset.policy';
import { TEMPLATE_SLUG_MAX_LENGTH } from '../../domain/design-template-slug';

export const publicDesignTemplateAssetParamsSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(TEMPLATE_SLUG_MAX_LENGTH)
      .regex(PUBLIC_DESIGN_TEMPLATE_SLUG_PATTERN),
    version: z.coerce.number().int().min(1).max(PUBLIC_TEMPLATE_ASSET_MAX_VERSION),
    // A UUID, because `assets.id` is one. Anything else can only ever match
    // nothing, and refusing it here keeps a malformed id from looking like a
    // legitimately absent Asset.
    assetId: z.string().uuid(),
  })
  .strict();

export class PublicDesignTemplateAssetParams extends createZodDto(
  publicDesignTemplateAssetParamsSchema,
) {}

registerZodDtos(PublicDesignTemplateAssetParams);
