/**
 * Request-side validation for the two Admin asset reads.
 *
 * The upload has no schema here on purpose: its body is a multipart stream that
 * the canonical Zod pipe must never buffer, so its contract is enforced by the
 * Busboy parser instead. Only the documented *shape* appears in OpenAPI.
 */
import type { AssetState } from '@embroidery/database';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  ACCEPTED_MEDIA_TYPES,
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
  MAX_UPLOAD_BYTES,
} from '../../domain/asset-intake.policy';

/**
 * The lifecycle values the list filter accepts.
 *
 * Declared here rather than imported as a runtime value: presentation must not
 * pull the ORM schema namespace in (`BACKEND_CONVENTIONS.md` §3). The assertion
 * below is the safety net — if `AssetState` ever gains a member, this file
 * stops compiling instead of silently rejecting a valid filter.
 */
const ASSET_STATUS_FILTERS = [
  'UPLOADED',
  'INSPECTING',
  'ACCEPTED',
  'REJECTED',
  'DELETION_PENDING',
  'DELETED',
] as const satisfies readonly AssetState[];

type MissingStatus = Exclude<AssetState, (typeof ASSET_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingStatus = MissingStatus extends never ? true : ['missing', MissingStatus];

/** UUID path parameter — rejected before any repository call. */
export const assetIdParamSchema = z
  .object({
    assetId: z.string().uuid(),
  })
  .strict();

export class AssetIdParam extends createZodDto(assetIdParamSchema) {}

/**
 * The list query.
 *
 * `limit` arrives as a string from the query string, so it is coerced then
 * bounded here as well as in `resolveLimit` — a value of `0` or `-1` is a
 * client bug worth reporting rather than silently clamping.
 */
export const listAssetsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(ASSET_STATUS_FILTERS).optional(),
    mediaType: z.enum(ACCEPTED_MEDIA_TYPES).optional(),
  })
  .strict();

export class ListAssetsQuery extends createZodDto(listAssetsQuerySchema) {}

registerZodDtos(AssetIdParam, ListAssetsQuery);

/**
 * Documentation-only description of the multipart body.
 *
 * Never used as a DTO: binding one would make Nest buffer the request, which is
 * exactly what the streaming intake exists to avoid. A function rather than a
 * frozen constant because `@ApiBody` requires a mutable `SchemaObject`.
 */
export function uploadMultipartSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['assetKind', 'classification', 'file'],
    properties: {
      assetKind: {
        type: 'string',
        enum: [INTAKE_ASSET_KIND],
        description: 'Fixed. Must arrive before the file part.',
      },
      classification: {
        type: 'string',
        enum: [INTAKE_CLASSIFICATION],
        description: 'Fixed by policy and not client-selectable. Must arrive before the file part.',
      },
      file: {
        type: 'string',
        format: 'binary',
        description: `Exactly one PNG, JPEG or WebP image of at most ${MAX_UPLOAD_BYTES} bytes.`,
      },
    },
  };
}
