/**
 * Path validation for Design Session asset delivery (`APP3-B06C`).
 *
 * `.strict()`: an unknown path field is a 400, not a silently ignored one. There
 * is no query object and no body at all — no size parameter, no format parameter,
 * no `?variant=original`. A rendition selector is not merely unimplemented here;
 * it is absent, because the one deliverable artifact is the canonical
 * `NORMALIZED` derivative and any parameter that could choose between artifacts
 * is a parameter that could eventually choose the private original.
 *
 * Both segments are UUIDs, because `design_sessions.id` and `assets.id` both are.
 * Refusing a malformed one at the boundary keeps it from arriving as a predicate
 * that matches nothing, which would be indistinguishable from a legitimately
 * absent row — and, for the session id, keeps it from being used to build a
 * cookie name. That second check is the accepted `APP3-B06A` authorization's, and
 * this schema does not replace it: a well-formed id that the caller does not own
 * is still refused there.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const designSessionAssetParamsSchema = z
  .object({
    sessionId: z.string().uuid(),
    assetId: z.string().uuid(),
  })
  .strict();

export class DesignSessionAssetParams extends createZodDto(designSessionAssetParamsSchema) {}

registerZodDtos(DesignSessionAssetParams);
