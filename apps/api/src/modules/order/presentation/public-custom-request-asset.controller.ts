/**
 * The two public APP5 intake operations (`APP5-B02` §4).
 *
 *   POST /api/public/custom-request-intake/challenges/:challengeId/assets
 *       — publicCustomRequestAsset_upload
 *   GET  /api/public/custom-request-intake/challenges/:challengeId/assets/:assetId
 *       — publicCustomRequestAsset_status
 *
 * Two, not one. The upload response is necessarily written before the inspector
 * has run, and `APP5-B01` binds only `ACCEPTED` assets — so without the status
 * read a customer's client could only submit and be refused, or guess. It is
 * not a list, not a delete and not a general asset API: both operations are
 * addressed *through* the challenge that authorizes them, so neither can answer
 * for an asset outside the window that produced it.
 *
 * ### Why there is no guard
 *
 * The credential *is* the challenge, and it is re-read inside the transaction
 * that acts on it — a guard could only read it earlier, outside that
 * transaction, and would then have to be trusted by the code that actually
 * reserves a slot. `APP5-B01` records the same reasoning for the same reason.
 *
 * Nor is there an Origin/Fetch-Metadata rule: unlike the APP3 Session lane there
 * is no ambient cookie here. A caller must already hold a challenge id, so
 * there is nothing for a cross-site page to ride on, and requiring an Origin
 * would only refuse legitimate non-browser callers.
 *
 * ### Separate from `PublicCustomRequestController`
 *
 * That class takes a `@Body()`; this one takes the raw request, because binding
 * a body would make Nest buffer 10 MiB in memory before the handler ever ran —
 * precisely what the streaming design exists to avoid. Merging them would also
 * push one class past the review threshold for a documented operation.
 */
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import {
  isAssetIntakeError,
  toHttpException as assetHttpException,
} from '../../asset/domain/asset-intake.errors';
import type { AssetId } from '../../asset/domain/repositories/asset.repository';
import type { ChallengeId } from '../../customer/domain/repositories/verification-challenge.repository';
import { RequestAssetIntakeService } from '../application/intake/request-asset-intake.service';
import type { RequestIntakeView } from '../application/intake/request-intake-projection';
import {
  RequestAssetStatusService,
  type RequestIntakeStatusView,
} from '../application/intake/request-asset-status.service';
import {
  isRequestIntakeError,
  toHttpException as intakeHttpException,
} from '../domain/intake/request-intake.errors';
import {
  MAX_REQUEST_INTAKE_BYTES,
  REQUEST_INTAKE_ROLES,
} from '../domain/intake/request-intake.policy';
import {
  parseRequestIntakeRole,
  requestIntakeMultipartSchema,
} from './schemas/request-asset-intake.request';
import {
  CustomRequestAssetIntakeResponse,
  CustomRequestAssetStatusResponse,
} from './schemas/request-asset-intake.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('publicCustomRequestAsset')
@ApiExtraModels(CustomRequestAssetIntakeResponse, CustomRequestAssetStatusResponse)
@Controller('public/custom-request-intake/challenges')
export class PublicCustomRequestAssetController {
  constructor(
    private readonly intake: RequestAssetIntakeService,
    private readonly statusReader: RequestAssetStatusService,
    private readonly clock: AuditClock,
  ) {}

  @Post(':challengeId/assets')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('CUSTOM_REQUEST_ASSET_ACCEPTED', 'Upload accepted for inspection.')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload one image as custom-request evidence',
    description:
      'Streams a single PNG, JPEG or WebP image of at most ' +
      `${MAX_REQUEST_INTAKE_BYTES} bytes into private storage and queues inspection. ` +
      'Authorized by a verified, unexpired SUBMISSION challenge that has not yet produced a ' +
      'request. The image is never public and is not attached to anything until the request ' +
      'is submitted. Idempotent: repeating the request with the same Idempotency-Key and the ' +
      'same file returns the original result and writes no second object or asset.',
  })
  @ApiParam({
    name: 'challengeId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The verified SUBMISSION challenge authorizing this upload.',
  })
  @ApiQuery({
    name: 'role',
    required: true,
    enum: REQUEST_INTAKE_ROLES,
    description:
      'COP_IMAGE for a photograph of the customer-owned garment, REFERENCE for supporting ' +
      'imagery. No other role is available.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8-128 characters of A-Z a-z 0-9 . _ : - identifying this upload attempt.',
  })
  @ApiBody({ schema: requestIntakeMultipartSchema() })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'The image is stored and queued for inspection.',
    schema: envelopeSchemaOf(CustomRequestAssetIntakeResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed multipart or missing idempotency key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 401,
    description: 'The challenge is unknown, unverified, expired or already submitted.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 403, description: 'That role is not available.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 408,
    description: 'The upload exceeded the hard duration.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate or conflicting attempt, or the per-challenge attachment limit.',
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
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async upload(
    @Req() request: IncomingMessage,
    @Param('challengeId') challengeId: string,
    @Query('role') role: unknown,
  ): Promise<RequestIntakeView> {
    try {
      return await this.intake.upload(request, {
        challengeId: challengeId as ChallengeId,
        // Parsed before anything else touches the body: an invalid role must not
        // cost the caller an upload, and it participates in the fingerprint.
        role: parseRequestIntakeRole(role),
      });
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  @Get(':challengeId/assets/:assetId')
  @ApiSuccessCode('CUSTOM_REQUEST_ASSET_STATUS', 'Attachment status read.')
  @ApiOperation({
    summary: 'Read the inspection state of one uploaded attachment',
    description:
      'Reports how far inspection has got for one image uploaded under this challenge, and ' +
      'whether it may be referenced in a submission. Answers only for an attachment uploaded ' +
      'by this challenge; anything else is indistinguishable from not existing.',
  })
  @ApiParam({
    name: 'challengeId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The verified SUBMISSION challenge the attachment was uploaded under.',
  })
  @ApiParam({
    name: 'assetId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The id returned by the upload operation.',
  })
  @ApiResponse({
    status: 200,
    description: 'The current inspection state.',
    schema: envelopeSchemaOf(CustomRequestAssetStatusResponse),
  })
  @ApiResponse({
    status: 401,
    description: 'The challenge is unknown, unverified, expired or already submitted.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'No such attachment for this challenge.',
    schema: ERROR_SCHEMA,
  })
  async status(
    @Param('challengeId') challengeId: string,
    @Param('assetId') assetId: string,
  ): Promise<RequestIntakeStatusView> {
    try {
      return await this.statusReader.read(
        challengeId as ChallengeId,
        assetId as AssetId,
        this.clock.now(),
      );
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  /**
   * Both error families reach the wire as themselves.
   *
   * `AssetIntakeError` is `APP2-B01`'s and is already bounded to the three media
   * classes APP5 is allowed to disclose, so it is mapped rather than re-wrapped:
   * re-coding it here would produce a second vocabulary for the same failures
   * and one of the two would drift.
   */
  private translate(error: unknown): unknown {
    if (isRequestIntakeError(error)) return intakeHttpException(error);
    if (isAssetIntakeError(error)) return assetHttpException(error);
    return error;
  }
}
