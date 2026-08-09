/**
 * The one published Template asset operation (`APP3-B05A`).
 *
 *   GET /api/public/design-templates/:slug/versions/:version/assets/:assetId
 *       — publicDesignTemplateAsset_get
 *
 * Anonymous by construction: no guard is applied, because none belongs here.
 * `AuthenticatedAdminGuard` and `StaffOriginGuard` are opt-in per controller in
 * this codebase, so "public" is the absence of a decorator rather than a setting
 * — and the contract spec asserts that absence so one cannot be added by
 * accident.
 *
 * ## Why the class is named the way it is
 *
 * The operation-id factory derives the domain from the controller class name, so
 * `PublicDesignTemplateAssetController` **is** the published contract
 * `publicDesignTemplateAsset_get`. `APP3-B04A` learned this the expensive way: a
 * responsibility split renamed all eight accepted Admin ids without a single line
 * of route changing. This controller is deliberately its own class rather than a
 * third method on `PublicDesignTemplateController` — it is a different
 * authorization and a different transport — and the name is chosen so the id it
 * mints is the one the phase recorded.
 *
 * The route shares the `public/design-templates` base with the two `APP3-B05`
 * JSON reads and collides with neither: it has four more segments than the detail
 * read and cannot be reached by any address either of them answers.
 *
 * The controller owns HTTP and the response stream, and nothing else. Which bytes
 * a caller may see is decided behind the service boundary, against the database
 * and against Catalog, on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicDesignTemplateAssetService } from '../application/public-design-template-asset.service';
import {
  PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL,
  PUBLIC_TEMPLATE_ASSET_CONTENT_DISPOSITION,
  PUBLIC_TEMPLATE_ASSET_CONTENT_TYPE_OPTIONS,
  PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES,
} from '../domain/public-design-template-asset.policy';
import {
  isPublicDesignTemplateAssetError,
  toHttpException,
} from '../domain/public-design-template-asset.errors';
import { PublicDesignTemplateAssetParams } from './schemas/public-design-template-asset.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Both deliverable types, documented as the alternatives they are. */
const BINARY_CONTENT = Object.fromEntries(
  PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES.map((type) => [
    type,
    { schema: { type: 'string', format: 'binary' } },
  ]),
);

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('publicDesignTemplateAsset')
@Controller('public/design-templates')
export class PublicDesignTemplateAssetController {
  constructor(private readonly assets: PublicDesignTemplateAssetService) {}

  @Get(':slug/versions/:version/assets/:assetId')
  @ApiOperation({
    operationId: 'publicDesignTemplateAsset_get',
    summary: 'Get one asset placed by the current published version of a design template',
    description:
      'Streams the editor-safe bytes of an asset referenced by the exact design-template version ' +
      'that is public right now. Anonymous: no session, cookie or storage credential is ' +
      'involved. The asset id is subordinate and grants nothing on its own — there is no ' +
      'address that serves an asset outside the template and version that authorise it. ' +
      'Publication, the current published version, the version document that references the ' +
      'asset, the durable template association, product and placement eligibility, and the ' +
      'derivative are all re-checked on every request, so unpublishing or archiving the ' +
      'template, publishing a newer version, retiring a side or an area, or withdrawing the ' +
      'product stops delivery immediately even for a caller that already knows the address. ' +
      'Only the current published version is addressable: an older version that was once ' +
      'public is refused exactly as an unknown one is. Responses are never cached.',
  })
  // Every parameter declares a `schema`. Without one the generator emits
  // `unknown` for that argument — the same family of trap `APP3-P04` recorded for
  // a response with no schema, and the reason the accepted `APP3-B05` detail read
  // takes an `unknown` slug today. Disclosed rather than repaired there; not
  // repeated here.
  @ApiParam({
    name: 'slug',
    description: 'The server-owned public design template slug.',
    schema: { type: 'string' },
  })
  @ApiParam({
    name: 'version',
    description:
      'The exact published version number. It must be the version this template exposes ' +
      'publicly at the time of the request; historical published versions are not addressable.',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiParam({
    name: 'assetId',
    description:
      'An opaque asset identity referenced by that version. It is not a storage reference and ' +
      'grants no access on its own.',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiProduces(...PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES)
  @ApiResponse({
    status: 200,
    description:
      'The editor-safe asset bytes: normalised raster, or template SVG that has already been ' +
      'sanitised server-side. Original uploads are never served.',
    content: BINARY_CONTENT,
    headers: {
      'Cache-Control': {
        description:
          'Always `no-store`. A version is immutable but its authorisation context is not.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed slug, version or asset id.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No asset is publicly available at this address. Returned identically for an unknown ' +
      'template, a draft, archived or unpublished one, a withdrawn product, a retired side or ' +
      'area, an unknown version, a version that was published in the past but is no longer the ' +
      'current one, an unknown or foreign asset, an asset the current version no longer places, ' +
      'an asset placed without a durable template association, and a derivative that is absent, ' +
      'unready, watermarked or incompletely described.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Asset storage is temporarily unavailable, or the stored object contradicts the recorded ' +
      'derivative.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: PublicDesignTemplateAssetParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.assets.open(
        { slug: params.slug, version: params.version, assetId: params.assetId },
        abort.signal,
      );
    } catch (error: unknown) {
      throw isPublicDesignTemplateAssetError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    // `once` because destroying twice is pointless, and the listener dies with
    // the request either way.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', PUBLIC_TEMPLATE_ASSET_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted, and
      // inventing one would describe the object falsely.
      disposition: PUBLIC_TEMPLATE_ASSET_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the provider's
      // count and the persisted `byte_size` agree, so there is no case in which a
      // length is unknown or would have to be guessed.
      length: stream.contentLengthBytes,
    });
  }
}

/**
 * An `AbortController` tied to the client's connection.
 *
 * The guard on `writableEnded` is what makes this correct rather than noisy:
 * `close` fires on every request, including the ones that completed normally, and
 * aborting after a finished response would report healthy traffic as cancelled.
 */
function watchClientDisconnect(
  request: IncomingMessage,
  response: HeaderSettableResponse,
): AbortController {
  const controller = new AbortController();
  request.once('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });
  return controller;
}
