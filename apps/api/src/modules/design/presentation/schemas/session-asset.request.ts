/**
 * The published request contract for the Session upload (`APP3-B06B` §13).
 *
 * The body is one binary part and nothing else. There are no `assetKind` or
 * `classification` fields here, unlike the Admin lane: an anonymous caller has
 * exactly one kind and one classification available to it, so a field whose only
 * legal value is a constant would be a field whose only possible effect is to be
 * filled in wrong.
 *
 * The schema is written out rather than derived from a DTO class because the
 * handler takes the raw request — binding a `@Body()` would make Nest buffer the
 * whole upload in memory before the handler ran, which is exactly what the
 * streaming design exists to avoid. Nothing is inferred from the wire, so
 * nothing here is a validation authority; the parser and the reader are.
 */
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';
import { MAX_SESSION_UPLOAD_BYTES } from '../../domain/session-asset-intake.policy';

export const SESSION_UPLOAD_FILE_PART = 'file';

export function sessionUploadMultipartSchema(): SchemaObject {
  return {
    type: 'object',
    required: [SESSION_UPLOAD_FILE_PART],
    properties: {
      [SESSION_UPLOAD_FILE_PART]: {
        type: 'string',
        format: 'binary',
        description:
          `Exactly one ${ACCEPTED_MEDIA_TYPES.join(', ')} image of at most ` +
          `${MAX_SESSION_UPLOAD_BYTES} bytes. The declared type must match the ` +
          'file signature; SVG, GIF and every other type is refused.',
      },
    },
  };
}
