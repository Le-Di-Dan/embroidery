/**
 * The one Design Session asset processing-status operation (`APP3-S06` §11).
 *
 *   GET /api/public/design-sessions/:sessionId/assets/:assetId/status
 *       — publicDesignSessionAsset_status
 *
 * A private, Session-owned UI projection — **not** a generic Asset endpoint.
 * There is no `GET /api/public/assets/{assetId}/status`, and the same `IMP-D044`
 * PO-06 reasoning forbids one: an address that answered for an Asset outside the
 * Session that authorizes it would replace a conjunctive ownership proof with an
 * existence check.
 *
 * ## Why a third class
 *
 * `PublicDesignSessionAssetController` owns the upload, and
 * `PublicDesignSessionAssetPreviewController` the binary. This is a third because
 * adding a fully documented operation to either pushes it past the review
 * threshold, and because a JSON projection and a byte stream have genuinely
 * different response concerns.
 *
 * The split renames nothing. `CONTROLLER_DOMAIN_KEYS` maps this class onto the
 * same `publicDesignSessionAsset` domain as the other two, which is exactly what
 * that table is for — `APP3-B04A` learned the expensive way that a
 * responsibility split silently reissues every operation id derived from a class
 * name.
 *
 * ## Guarded exactly like the binary read
 *
 * `DesignSessionReadGuard`, unchanged: the same cookie, the same peppered HMAC,
 * the same liveness, the same failure budget, the same read limit. Nothing about
 * authorization is re-implemented here, and no mutation rule is inherited —
 * polling a status is not a change to the Session.
 */
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import type { HeaderSettableResponse } from '../../../platform/http-response/client-disconnect';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import {
  DesignSessionAssetStatusService,
  type SessionAssetStatusView,
} from '../application/design-session-asset-status.service';
import { SESSION_ASSET_CACHE_CONTROL } from '../domain/design-session-asset-delivery.policy';
import {
  isDesignSessionAssetError,
  toHttpException,
} from '../domain/design-session-asset-delivery.errors';
import type { DesignSessionId } from '../domain/repositories/design-session.repository';
import { CurrentDesignSession, type DesignSessionContext } from './design-session-context';
import { DesignSessionReadGuard } from './guards/design-session-read.guard';
import { DesignSessionAssetParams } from './schemas/design-session-asset-delivery.request';
import { DesignSessionAssetStatusResponse } from './schemas/design-session-asset-status.response';

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
export class PublicDesignSessionAssetStatusController {
  constructor(private readonly statuses: DesignSessionAssetStatusService) {}

  @Get(':sessionId/assets/:assetId/status')
  @UseGuards(DesignSessionReadGuard)
  @ApiSuccessCode('DESIGN_SESSION_ASSET_STATUS', 'Current processing state of a session upload.')
  @ApiOperation({
    operationId: 'publicDesignSessionAsset_status',
    summary: 'Get the processing state of an image uploaded into a design session',
    description:
      'Reports whether an image this session uploaded is still being processed, is ready to ' +
      'place, or was refused by inspection. Private: the per-session HttpOnly cookie is ' +
      'verified on every request, and the session id alone grants nothing. The asset id is ' +
      'subordinate and grants nothing on its own. An unknown asset, an asset belonging to ' +
      'another session and an asset this session never uploaded are one indistinguishable ' +
      'answer. Only the ready state carries media fields, and those are the measured intrinsic ' +
      'dimensions, media type and size of the editor-safe image — never a storage address, a ' +
      'checksum, a filename or anything about how processing is implemented. Reading changes ' +
      'nothing: no revision advances, no cookie is issued or rotated, and the expiry is not ' +
      `extended. Responses are \`${SESSION_ASSET_CACHE_CONTROL}\`, because what is being ` +
      'reported is a state that changes and an authorisation that can end.',
  })
  @ApiParam({
    name: 'sessionId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description:
      'Public Design Session identifier. It selects the cookie that must accompany the ' +
      'request; it is not itself a credential.',
  })
  @ApiParam({
    name: 'assetId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description:
      'An opaque asset identity uploaded by that session. It is not a storage reference and ' +
      'grants no access on its own.',
  })
  @ApiExtraModels(DesignSessionAssetStatusResponse)
  @ApiResponse({
    status: 200,
    description: 'The current processing state.',
    schema: envelopeOf(DesignSessionAssetStatusResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed session or asset id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 401,
    description: 'The session could not be authorized.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'A cross-site request. No cookie is read.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'This session has no upload at this address. Returned identically for an unknown asset, ' +
      'an asset belonging to another session, an asset this session never uploaded and a ' +
      'tombstoned one.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 429, description: 'Too many requests.', schema: ERROR_SCHEMA })
  async status(
    @Param() params: DesignSessionAssetParams,
    @CurrentDesignSession() context: DesignSessionContext,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<SessionAssetStatusView> {
    // The same rule the binary carries, for the same reason and then one more:
    // the *authorisation* around this answer can end, and the answer itself is a
    // state that changes. A cached `PROCESSING` would leave the Studio polling a
    // stored response forever.
    response.setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL);

    try {
      return await this.statuses.read({
        // From the authorized context, never the path string: the guard proved
        // ownership of *that* id.
        sessionId: context.designSessionId as DesignSessionId,
        assetId: params.assetId,
        at: context.authorizedAt,
      });
    } catch (error: unknown) {
      throw isDesignSessionAssetError(error) ? toHttpException(error) : error;
    }
  }
}
