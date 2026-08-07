/**
 * The one anonymous Session upload operation (`APP3-B06B`).
 *
 *   POST /api/public/design-sessions/:sessionId/assets
 *       — publicDesignSessionAsset_create
 *
 * Separate from `PublicDesignSessionController` despite sharing a base path,
 * because it is a different kind of route: it takes the raw request rather than
 * a `@Body()`, since binding a body would make Nest buffer 10 MiB in memory
 * before the handler ever ran — precisely what the streaming design exists to
 * avoid.
 *
 * Every security check is `APP3-B06A`'s, reused through `DesignSessionGuard`:
 * Origin and Fetch Metadata first, then the id+secret pair, then the failure
 * budget, then the mutation limit. The guard runs before a single body byte is
 * read, so an unauthorized caller never causes storage work. Nothing about
 * cookies, HMAC or limits is re-implemented here, and a foreign Session
 * credential authorizes nothing: the guard resolves the session from the path
 * and the context carries that id, so the upload can only ever land in the
 * session whose secret was presented.
 */
import { Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { isAssetIntakeError, toHttpException } from '../../asset/domain/asset-intake.errors';
import { SessionAssetIntakeService } from '../application/session-asset-intake.service';
import type { SessionAssetIntakeView } from '../application/session-asset-projection';
import {
  MAX_SESSION_UPLOAD_BYTES,
  SESSION_REVISION_HEADER,
} from '../domain/session-asset-intake.policy';
import { CurrentDesignSession, type DesignSessionContext } from './design-session-context';
import { DesignSessionGuard } from './guards/design-session.guard';
import { DesignSessionAssetIntakeResponse } from './schemas/session-asset.response';
import { sessionUploadMultipartSchema } from './schemas/session-asset.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

@ApiTags('publicDesignSessionAsset')
@Controller('public/design-sessions')
export class PublicDesignSessionAssetController {
  constructor(private readonly intake: SessionAssetIntakeService) {}

  @Post(':sessionId/assets')
  @UseGuards(DesignSessionGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('DESIGN_SESSION_ASSET_ACCEPTED', 'Upload accepted for inspection.')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload one raster image into a design session',
    description:
      'Streams a single PNG, JPEG or WebP image of at most ' +
      `${MAX_SESSION_UPLOAD_BYTES} bytes into private storage, associates it with the ` +
      'session and queues inspection and normalization. The image is never public. ' +
      'Idempotent: repeating the request with the same Idempotency-Key and the same file ' +
      'returns the original result and writes no second object or association.',
  })
  @ApiParam({
    name: 'sessionId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'Public Design Session identifier.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8-128 characters of A-Z a-z 0-9 . _ : - identifying this upload attempt.',
  })
  @ApiHeader({
    name: SESSION_REVISION_HEADER,
    required: true,
    description:
      'The session revision the client last read. A mismatch is refused rather than ' +
      'overwriting a newer change.',
  })
  @ApiBody({ schema: sessionUploadMultipartSchema() })
  @ApiExtraModels(DesignSessionAssetIntakeResponse)
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'The image is stored, associated and queued.',
    schema: envelopeOf(DesignSessionAssetIntakeResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed multipart, missing revision or idempotency key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 401,
    description: 'The session could not be authorized.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'Origin or Fetch Metadata refused.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 408,
    description: 'The upload exceeded the hard duration.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate, conflicting or stale attempt, or a stale session revision.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 413,
    description: 'The file exceeds the maximum permitted size.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported media type or signature mismatch.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 429, description: 'Too many requests.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async create(
    @Req() request: IncomingMessage,
    @CurrentDesignSession() context: DesignSessionContext,
  ): Promise<SessionAssetIntakeView> {
    try {
      // The session id comes from the authorized context, never from the path
      // string: the guard proved ownership of *that* id, and re-reading the
      // parameter here would reintroduce the gap the guard just closed.
      return await this.intake.upload(request, context.designSessionId);
    } catch (error: unknown) {
      throw isAssetIntakeError(error) ? toHttpException(error) : error;
    }
  }
}
