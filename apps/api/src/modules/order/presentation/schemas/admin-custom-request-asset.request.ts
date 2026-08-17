/**
 * Path validation for Admin request-asset delivery (`APP5-B06` §7).
 *
 * `.strict()`: an unknown path field is a 400, not a silently ignored one. There
 * is no query object and no body at all — no size parameter, no format
 * parameter, no `?variant=`, no `?download=`. A rendition selector is not merely
 * unimplemented here; it is absent, because the one deliverable artifact is the
 * inspection-approved source and any parameter that could choose between
 * artifacts is a parameter that could eventually choose something else.
 *
 * Both segments are UUIDs, because `custom_requests.id` and `assets.id` both
 * are. Refusing a malformed one at the boundary keeps it from arriving as a
 * predicate that matches nothing, which would be indistinguishable from a
 * legitimately absent row.
 *
 * Neither segment is a credential and neither is trusted alone. The operator's
 * identity comes from `AuthenticatedAdminGuard`; these two only say *which*
 * evidence is being asked for, and the association between them is proved
 * against the database on every request.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const adminRequestAssetParamsSchema = z
  .object({
    requestId: z.string().uuid(),
    assetId: z.string().uuid(),
  })
  .strict();

export class AdminRequestAssetParams extends createZodDto(adminRequestAssetParamsSchema) {}

registerZodDtos(AdminRequestAssetParams);
