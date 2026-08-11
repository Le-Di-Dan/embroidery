/**
 * The one private Design Session asset delivery operation (`APP3-B06C`).
 *
 *   GET /api/public/design-sessions/:sessionId/assets/:assetId/editor-preview
 *       — publicDesignSessionAsset_get
 *
 * `IMP-D044` PO-06 delivery class 3, and the last of the three. Like classes 1
 * and 2 it is one operation on one contextual address: there is no
 * `GET /api/public/assets/{assetId}`, and adding one would replace a conjunctive
 * ownership proof with a single existence check.
 *
 * ## Why this is a second class beside the upload controller
 *
 * `PublicDesignSessionAssetController` owns `POST …/assets`. This is deliberately
 * a different class rather than a second method on it: the two are a mutation and
 * a safe read, they carry different guards, and the upload handler takes the raw
 * request because binding a body would buffer 10 MiB before the handler ran.
 * Keeping them together pushed one file past the review threshold for no gain.
 *
 * The split does **not** rename anything. `CONTROLLER_DOMAIN_KEYS` maps this
 * class onto the `publicDesignSessionAsset` domain, which is what that table
 * exists for — `APP3-B04A` learned the expensive way that a responsibility split
 * silently reissues every operation id derived from a class name. The entry
 * states a contract fact: these two classes serve one published domain.
 *
 * ## What the controller decides
 *
 * Nothing about access. It owns HTTP and the response stream; which bytes a
 * caller may see is decided by the read guard and then, behind the service
 * boundary, against the database — on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import {
  watchClientDisconnect,
  type HeaderSettableResponse,
} from '../../../platform/http-response/client-disconnect';
import { DesignSessionAssetDeliveryService } from '../application/design-session-asset-delivery.service';
import {
  SESSION_ASSET_CACHE_CONTROL,
  SESSION_ASSET_CONTENT_DISPOSITION,
  SESSION_ASSET_CONTENT_TYPE_OPTIONS,
  SESSION_ASSET_MEDIA_TYPES,
} from '../domain/design-session-asset-delivery.policy';
import {
  isDesignSessionAssetError,
  toHttpException,
} from '../domain/design-session-asset-delivery.errors';
import type { DesignSessionId } from '../domain/repositories/design-session.repository';
import { CurrentDesignSession, type DesignSessionContext } from './design-session-context';
import { DesignSessionReadGuard } from './guards/design-session-read.guard';
import { DesignSessionAssetParams } from './schemas/design-session-asset-delivery.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/**
 * The deliverable type, documented as the only alternative there is.
 *
 * Built from the policy allowlist rather than written out, so the published
 * contract cannot claim a type the delivery path would refuse to stream.
 */
const DELIVERABLE_CONTENT = Object.fromEntries(
  SESSION_ASSET_MEDIA_TYPES.map((type) => [type, { schema: { type: 'string', format: 'binary' } }]),
);

@ApiTags('publicDesignSessionAsset')
@Controller('public/design-sessions')
export class PublicDesignSessionAssetPreviewController {
  constructor(private readonly delivery: DesignSessionAssetDeliveryService) {}

  @Get(':sessionId/assets/:assetId/editor-preview')
  @UseGuards(DesignSessionReadGuard)
  @ApiOperation({
    operationId: 'publicDesignSessionAsset_get',
    summary: 'Get the editor-safe preview of an image uploaded into a design session',
    description:
      'Streams the normalized, editor-safe bytes of an image this session uploaded. Private: ' +
      'the per-session HttpOnly cookie is verified on every request, and the session id alone ' +
      'grants nothing. The asset id is subordinate and grants nothing on its own — there is no ' +
      'address that serves an asset outside the session that authorises it, and a cookie for ' +
      'one session can never read another session’s upload. The association, the session ' +
      'liveness, the upload lane, the inspection verdict and the derivative are all re-checked ' +
      'on every request, so an expired session or a withdrawn image stops delivering ' +
      'immediately even for a caller that already knows the address. The uploaded original is ' +
      'never served and there is no parameter that could ask for it. Reading never changes the ' +
      'session: no revision advances, no cookie is issued or rotated, and the expiry is not ' +
      'extended. Responses are never cached — the bytes are immutable but the authorisation ' +
      'around them is not.',
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
  @ApiProduces(...SESSION_ASSET_MEDIA_TYPES)
  @ApiResponse({
    status: 200,
    description:
      'The editor-safe image: the normalized derivative the asset pipeline produced. Original ' +
      'uploads are never served.',
    content: DELIVERABLE_CONTENT,
    headers: {
      'Cache-Control': {
        description:
          'Always `no-store`. The bytes are immutable but the session authorising them is not.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
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
      'No image is available at this address for this session. Returned identically for an ' +
      'unknown asset, an asset belonging to another session, a missing association, an asset ' +
      'outside the customer-private upload lane, a tombstoned one, one still being inspected, ' +
      'one that inspection rejected, and a derivative that is absent, unready, watermarked or ' +
      'incompletely described.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 429, description: 'Too many failed attempts.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 503,
    description:
      'Image storage is temporarily unavailable, or the stored object contradicts the recorded ' +
      'derivative.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: DesignSessionAssetParams,
    @CurrentDesignSession() context: DesignSessionContext,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.delivery.open(
        {
          // The session id comes from the authorized context, never from the path
          // string: the guard proved ownership of *that* id, and re-reading the
          // parameter here would reintroduce the gap the guard just closed.
          sessionId: context.designSessionId as DesignSessionId,
          assetId: params.assetId,
          at: context.authorizedAt,
        },
        abort.signal,
      );
    } catch (error: unknown) {
      throw isDesignSessionAssetError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', SESSION_ASSET_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted, and
      // inventing one would describe the object falsely.
      disposition: SESSION_ASSET_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the provider
      // count and the persisted `byte_size` agree.
      length: stream.contentLengthBytes,
    });
  }
}
