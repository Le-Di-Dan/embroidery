/**
 * The published request contract for APP5 customer intake (`APP5-B02` §4).
 *
 * The body is one binary part and nothing else. There is no `customerId`, no
 * `requestId`, no `storageKey`, no `assetKind` and no `classification`: each is
 * either derived from the challenge or fixed by the lane, and a field whose only
 * legal value is a constant is a field whose only possible effect is to be
 * filled in wrong.
 *
 * `role` travels as a query parameter rather than a multipart field because it
 * has to be known *before* the first byte is streamed — it participates in the
 * idempotency fingerprint — and a trailing multipart field cannot guarantee
 * that. It is validated here rather than trusted: the allowlist is the policy's,
 * so `ATTACHMENT` is refused by the same constant that documents the surface.
 *
 * The multipart schema is written out rather than derived from a DTO class
 * because the handler takes the raw request; binding a `@Body()` would make Nest
 * buffer the whole upload in memory before the handler ran, which is exactly
 * what the streaming design exists to avoid.
 */
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';
import { requestIntakeError } from '../../domain/intake/request-intake.errors';
import {
  isRequestIntakeRole,
  MAX_REQUEST_INTAKE_BYTES,
  type RequestIntakeRole,
} from '../../domain/intake/request-intake.policy';

export const REQUEST_INTAKE_FILE_PART = 'file';

export function requestIntakeMultipartSchema(): SchemaObject {
  return {
    type: 'object',
    required: [REQUEST_INTAKE_FILE_PART],
    properties: {
      [REQUEST_INTAKE_FILE_PART]: {
        type: 'string',
        format: 'binary',
        description:
          `Exactly one ${ACCEPTED_MEDIA_TYPES.join(', ')} image of at most ` +
          `${MAX_REQUEST_INTAKE_BYTES} bytes. The declared type must match the ` +
          'file signature; SVG, GIF and every other type is refused.',
      },
    },
  };
}

/**
 * Narrows the query value to a role, or refuses.
 *
 * A repeated query parameter arrives as an array; that is a rejection rather
 * than "first wins", because two different roles in one request has no correct
 * interpretation and picking one would silently store evidence under a meaning
 * the caller did not choose.
 */
export function parseRequestIntakeRole(raw: unknown): RequestIntakeRole {
  if (!isRequestIntakeRole(raw)) {
    throw requestIntakeError('REQUEST_INTAKE_ROLE_INVALID');
  }
  return raw;
}
