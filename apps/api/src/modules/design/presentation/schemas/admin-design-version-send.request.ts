/**
 * Request-side validation for the Admin design-version send (`APP6-B09` §4).
 *
 * Two path parameters, and **no body schema at all** — not an empty one, and not
 * an optional one. The server already owns the Admin identity, the request
 * identity, the design case identity, the persisted version and its document,
 * the branch, the placement facts, the send instant, the hash and both target
 * states. There is nothing left for a caller to supply, so the operation accepts
 * nothing, and an operator cannot believe they set something the server derives.
 *
 * The `.strict()` param object is the same guard `APP6-B08` applies: an
 * unrecognised path key is a `400`, not a silently ignored one.
 *
 * `versionId` is an exact **locator**, never ownership authority. Nothing about
 * carrying it in the path authorizes it: the use case proves
 * `requestId → current_design_case_id → case → version.design_case_id` inside
 * the send transaction, and a version belonging to another request gets the same
 * answer as one that does not exist.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const designVersionSendParamsSchema = z
  .object({ requestId: z.string().uuid(), versionId: z.string().uuid() })
  .strict();

export class DesignVersionSendParams extends createZodDto(designVersionSendParamsSchema) {}

registerZodDtos(DesignVersionSendParams);
