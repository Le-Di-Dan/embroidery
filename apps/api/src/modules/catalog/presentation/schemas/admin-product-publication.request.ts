/**
 * Request-side validation for the three publication operations (`APP2-B03` §6).
 *
 * Both command bodies are `.strict()` and carry exactly one field. An unknown
 * field is rejected rather than dropped: a caller that believes it sent a
 * reason, a status or a publish date must be told it did not, and accepting a
 * field the server owns is how a request puts a row into a state the lifecycle
 * would later have to repair.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The concurrency token, echoed back exactly as it was published.
 *
 * Mandatory on both commands: a publication transition without one is the
 * unguarded read-then-write the whole design forbids.
 */
export const publicationCommandBodySchema = z
  .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .strict();

export class PublishProductBody extends createZodDto(publicationCommandBodySchema) {}

export class UnpublishProductBody extends createZodDto(publicationCommandBodySchema) {}

// Both commands publish the same one-field body under their own component name;
// the registry accepts a shared schema, never two different ones under one name.
registerZodDtos(PublishProductBody, UnpublishProductBody);
