/**
 * Path parameters for the two Admin quotation reads (`APP6-B02`).
 *
 * There is no query object and no body: neither read filters, pages or sorts.
 * The history is the whole history and the detail is one addressed version, so
 * the entire input surface is two identifiers in the path.
 *
 * Both are `.strict()` and both are UUIDs, rejected before any repository call —
 * a malformed id is a `400` here rather than a `404` after a round trip. Neither
 * is an authority: the operator is bound by `AuthenticatedAdminGuard` and is
 * never a parameter, so these locate a row and nothing more.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { quotationIdParamSchema } from './admin-quotation.request';

/**
 * `{quotationId}/versions/{versionId}`.
 *
 * The quotation id is not redundant with the version id, even though a version
 * id alone would find the row: it is what makes the containment check possible,
 * so one quotation's URL can never serve another's price.
 */
export const quotationVersionParamsSchema = quotationIdParamSchema
  .extend({ versionId: z.string().uuid() })
  .strict();

export class QuotationVersionParams extends createZodDto(quotationVersionParamsSchema) {}

registerZodDtos(QuotationVersionParams);
