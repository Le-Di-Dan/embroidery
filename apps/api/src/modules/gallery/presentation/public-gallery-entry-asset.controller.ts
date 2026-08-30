/**
 * The one public gallery-media operation (`APP11-B03` §9).
 *
 *   GET /api/public/gallery-entries/:slug/assets/:assetId/:rendition
 *       — publicGalleryEntry_asset
 *
 * Anonymous by construction: no guard is applied, because none belongs here.
 * `AuthenticatedAdminGuard` and `StaffOriginGuard` are opt-in per controller in
 * this codebase, so "public" is the absence of a decorator rather than a
 * setting — the contract suite asserts that absence so it cannot be added by
 * accident.
 *
 * This route exists so the Gallery frontend never receives a raw object-storage
 * path. The controller owns HTTP and the response stream and nothing else:
 * which bytes a caller may see is decided behind the service boundary, against
 * the database, on every single request.
 *
 * A separate class from `PublicGalleryEntryController` because this one needs
 * the object-storage port and the JSON reads must not share a graph with it;
 * `CONTROLLER_DOMAIN_KEYS` keeps both in the one published `publicGalleryEntry`
 * family so that composition decision cannot name a public identifier.
 */
import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicGalleryMediaService } from '../application/public-gallery-media.service';
import {
  PUBLIC_GALLERY_MEDIA_RENDITIONS,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
} from '../domain/public-gallery-media.policy';
import { isPublicGalleryMediaError, toHttpException } from '../domain/public-gallery-media.errors';
import { PublicGalleryMediaParams } from './schemas/public-gallery-entry.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('publicGalleryEntry')
@Controller('public/gallery-entries')
export class PublicGalleryEntryAssetController {
  constructor(private readonly media: PublicGalleryMediaService) {}

  @Get(':slug/assets/:assetId/:rendition')
  @ApiOperation({
    operationId: 'publicGalleryEntry_asset',
    summary: 'Get one published gallery image',
    description:
      'Streams the requested rendition of one image attached to a PUBLISHED gallery entry. ' +
      'Anonymous: no session, cookie or storage credential is involved. Publication, the ' +
      'association and the asset lane are all re-checked on every request, so unpublishing ' +
      'an entry or withdrawing an image stops delivery immediately even for a caller that ' +
      'already knows the address. Responses are never cached.',
  })
  @ApiParam({ name: 'slug', description: 'The server-owned gallery slug.' })
  @ApiParam({
    name: 'assetId',
    format: 'uuid',
    description:
      'Opaque identity of the image associated with this entry. It is not a storage ' +
      'reference and grants no access on its own.',
  })
  @ApiParam({
    name: 'rendition',
    enum: PUBLIC_GALLERY_MEDIA_RENDITIONS,
    description: '`thumbnail` for feed cards, `catalog-preview` for the detail gallery.',
  })
  @ApiProduces(PUBLIC_MEDIA_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The image bytes.',
    content: { [PUBLIC_MEDIA_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
    headers: {
      'Cache-Control': {
        description: 'Always `no-store`, so a cache cannot outlive an unpublish.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed slug, asset id or rendition.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No image is publicly available at this address. Returned identically for an unknown ' +
      'entry, a draft or archived entry, an unknown asset, an asset associated with a ' +
      'different entry, a private or production-sensitive asset, a rejected, ' +
      'deletion-pending or tombstoned asset, and an image whose rendition is not ready.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async asset(
    @Param() params: PublicGalleryMediaParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.media.open(params, abort.signal);
    } catch (error: unknown) {
      throw isPublicGalleryMediaError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', PUBLIC_MEDIA_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted,
      // and inventing one would describe the object falsely.
      disposition: PUBLIC_MEDIA_CONTENT_DISPOSITION,
      ...(stream.contentLengthBytes === undefined ? {} : { length: stream.contentLengthBytes }),
    });
  }
}

/**
 * An `AbortController` tied to the client connection.
 *
 * The guard on `writableEnded` is what makes this correct rather than noisy:
 * `close` fires on every request, including the ones that completed normally,
 * and aborting after a finished response would report healthy traffic as
 * cancelled.
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
