/**
 * The one private Admin request-asset delivery operation (`APP5-B06`).
 *
 * ```text
 * GET /api/admin/custom-requests/:requestId/assets/:assetId/content
 *     — adminCustomRequestAsset_get
 * ```
 *
 * One operation on one contextual address. There is no
 * `GET /api/admin/assets/{assetId}`, and adding one would replace a conjunctive
 * association proof with a single existence check. `APP5-B04` already owns the
 * attachment *metadata* — media type, size, state — and publishes no key; this
 * publishes the bytes and still no key, which is what closes
 * `FU-APP5-B04-COP-ASSET-DELIVERY-01`.
 *
 * ## Why this is a separate class from the two B04 reads
 *
 * `AdminCustomRequestController` returns JSON envelopes; this returns a byte
 * stream with its own headers, its own error vocabulary and its own
 * `@Res({ passthrough: true })` plumbing. Folding a binary handler into the
 * read model would push that file past the review threshold and mix two
 * response contracts in one class.
 *
 * The split is a **new domain**, not a rename. `adminCustomRequestAsset` derives
 * from this class name with no `CONTROLLER_DOMAIN_KEYS` entry, exactly as
 * `PublicCustomRequestAssetController` does for the intake lane: the attachment
 * surface is its own published domain rather than a split of the request domain,
 * so B04's and B05's four accepted operation ids are untouched.
 *
 * ## What the controller decides
 *
 * Nothing about access. It owns HTTP and the response stream; which bytes a
 * caller may see is decided by `AuthenticatedAdminGuard` and then, behind the
 * service boundary, against the database — on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import {
  watchClientDisconnect,
  type HeaderSettableResponse,
} from '../../../platform/http-response/client-disconnect';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { DeliverRequestAsset } from '../application/admin/deliver-request-asset.use-case';
import {
  REQUEST_ASSET_CACHE_CONTROL,
  REQUEST_ASSET_CONTENT_DISPOSITION,
  REQUEST_ASSET_CONTENT_TYPE_OPTIONS,
  REQUEST_ASSET_MEDIA_TYPES,
} from '../domain/delivery/request-asset-delivery.policy';
import {
  isRequestAssetDeliveryError,
  toHttpException,
} from '../domain/delivery/request-asset-delivery.errors';
import type { CustomRequestId } from '../domain/repositories/custom-request.repository';
import { AdminRequestAssetParams } from './schemas/admin-custom-request-asset.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/**
 * The deliverable types, documented as the only alternatives there are.
 *
 * Built from the policy allowlist rather than written out, so the published
 * contract cannot claim a type the delivery path would refuse to stream.
 */
const DELIVERABLE_CONTENT = Object.fromEntries(
  REQUEST_ASSET_MEDIA_TYPES.map((type) => [type, { schema: { type: 'string', format: 'binary' } }]),
);

@ApiTags('adminCustomRequestAsset')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
export class AdminCustomRequestAssetController {
  constructor(private readonly delivery: DeliverRequestAsset) {}

  @Get(':requestId/assets/:assetId/content')
  @ApiOperation({
    summary: 'Open one attachment submitted with a custom request',
    description:
      'Streams the validated image a customer submitted as evidence for this request — the ' +
      'COP photograph or a reference. Private: the Admin session cookie is verified on every ' +
      'request, and the asset id grants nothing on its own. There is no address that serves an ' +
      'attachment outside the request it is bound to, so an id lifted from one request cannot ' +
      'be read through another. The association, the role, the upload lane, the inspection ' +
      'verdict and the tombstone are re-checked on every request. What is served is the ' +
      'inspection-approved source the customer uploaded: APP5 produces no normalized ' +
      'derivative of request evidence, and none is generated here. No storage location, ' +
      'provider address or credential of any kind appears in the response, and there is no ' +
      'parameter that could ask for one. Reading changes nothing: no status moves, no ' +
      'transition or note is appended, no retention is extended and the Admin session is not ' +
      'rotated. Responses are never cached — the bytes are immutable but the authorisation ' +
      'around them is not.',
  })
  @ApiParam({
    name: 'requestId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The custom request the attachment was submitted with. Part of the authorization.',
  })
  @ApiParam({
    name: 'assetId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description:
      'An attachment id from the request detail. It names no stored object and grants no ' +
      'access on its own.',
  })
  @ApiProduces(...REQUEST_ASSET_MEDIA_TYPES)
  @ApiResponse({
    status: 200,
    description:
      'The submitted image: the validated, inspection-approved bytes the customer uploaded.',
    content: DELIVERABLE_CONTENT,
    headers: {
      'Cache-Control': {
        description:
          'Always `private, no-store`. The bytes are immutable but the session authorising them ' +
          'is not.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed request or asset id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'No attachment is available at this address. Returned identically for an unknown request, ' +
      'an unknown asset, an asset bound to another request, an unbound asset, an ATTACHMENT ' +
      'association, an asset outside the customer-private upload lane, a tombstoned one, one ' +
      'still being inspected, one that inspection rejected, and one whose stored source is ' +
      'incompletely described or of an undeliverable type.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Attachment storage is temporarily unavailable, or the stored object contradicts the ' +
      'recorded size.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: AdminRequestAssetParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.delivery.open(
        { requestId: params.requestId as CustomRequestId, assetId: params.assetId },
        abort.signal,
      );
    } catch (error: unknown) {
      throw isRequestAssetDeliveryError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', REQUEST_ASSET_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', REQUEST_ASSET_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted, and
      // inventing one would describe the object falsely.
      disposition: REQUEST_ASSET_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the provider
      // count and the persisted `size_bytes` agree.
      length: stream.contentLengthBytes,
    });
  }
}
