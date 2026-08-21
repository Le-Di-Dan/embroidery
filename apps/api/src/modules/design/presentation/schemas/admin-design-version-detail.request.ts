/**
 * Request-side validation for the exact-version Admin detail read
 * (`APP6-A02` §5, §6).
 *
 * Two path parameters and **no body schema at all** — not an empty one, and not
 * an optional one. It is a GET: there is nothing for a caller to supply, and an
 * operation that accepted a body would invite an operator to believe they had
 * narrowed, filtered or selected something the server derives.
 *
 * `.strict()` is the same guard `APP6-B08` and `APP6-B09` apply: an unrecognised
 * path key is a `400`, not a silently ignored one. There is deliberately no
 * `designCaseId` parameter, no `caseId` query, no `version` number alternative
 * and no `current` shorthand — `APP6-A02` §5 authorizes exactly one exact-version
 * read, and each of those would be a second way to address a design thread.
 *
 * `versionId` is an exact **locator**, never ownership authority. Nothing about
 * carrying it in the path authorizes it: the query proves
 * `requestId → current_design_case_id → case → version.design_case_id` before
 * any field is projected, and a version belonging to another request gets the
 * same answer as one that does not exist.
 *
 * Declared in its own file rather than added to `admin-design-version.request.ts`
 * so that this checkpoint changes no source `APP6-B08` owns — which is also why
 * B08's suite is not part of A02's validation set.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const designVersionDetailParamsSchema = z
  .object({ requestId: z.string().uuid(), versionId: z.string().uuid() })
  .strict();

export class DesignVersionDetailParams extends createZodDto(designVersionDetailParamsSchema) {}

registerZodDtos(DesignVersionDetailParams);
