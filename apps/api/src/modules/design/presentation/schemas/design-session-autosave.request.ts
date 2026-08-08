/**
 * The autosave request contract (`APP3-B08` §4).
 *
 * A plain object, so the ordinary `createZodDto` path applies. `APP3-B07` needed
 * a union bridge because its body genuinely is a discriminated union; copying
 * that machinery for a two-field object would be carrying a workaround to a
 * problem this operation does not have.
 *
 * `document` is deliberately typed as a permissive record here and **not**
 * mirrored as a Zod copy of the Design Document schema. `APP3-P01` owns that
 * schema, and a second definition at the HTTP edge is the exact duplication
 * `IMP-D042`-era gates exist to prevent: the two would drift, and the edge copy
 * would start accepting or refusing documents the canonical authority does not.
 * So this layer proves only that a JSON object arrived, and the P01 pipeline —
 * structure, complexity, quantization, canonicalization — is the sole judge of
 * what it contains. The OpenAPI schema below still publishes the shape as a
 * concrete object with its required fields, never `{}`.
 *
 * Everything the server owns is absent by construction and rejected by
 * `.strict()`: no session id, secret, status, expiry, revision to *set*, schema
 * version, storage field or customer identity. The persisted schema version is
 * derived from the document itself, never accepted from the caller.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The revision the caller last read.
 *
 * A non-negative integer, so a fractional or negative value is a 400 rather than
 * something the CAS silently fails to match. Bounded above by the same 9-digit
 * ceiling the upload lane uses, because a revision larger than that is not a
 * real session.
 */
const expectedRevision = z
  .number()
  .int('Must be a whole number.')
  .min(0, 'Must not be negative.')
  .max(999_999_999)
  .meta({
    description: 'The autosave revision the client last read. A mismatch is refused, not merged.',
    example: 3,
  });

const autosaveSchema = z
  .object({
    expectedRevision,
    document: z.record(z.string(), z.unknown()).meta({
      description:
        'The complete canonical Design Document snapshot. Validated, quantized and ' +
        'canonicalized by the Design Document authority; the stored value is the ' +
        'canonical form, not the object as sent.',
    }),
  })
  .strict()
  .meta({ id: 'AutosaveDesignSessionBody' });

export class AutosaveDesignSessionBody extends createZodDto(autosaveSchema) {}

registerZodDtos(AutosaveDesignSessionBody);
