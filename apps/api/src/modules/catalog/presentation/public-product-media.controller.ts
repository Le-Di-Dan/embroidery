/**
 * The one public catalog-media operation (`APP2-T01`).
 *
 *   GET /api/public/products/:slug/media/:productMediaId/:rendition
 *       — publicProductMedia_get
 *
 * Anonymous by construction: no guard is applied, because none belongs here.
 * `AuthenticatedAdminGuard` and `StaffOriginGuard` are opt-in per controller in
 * this codebase, so "public" is the absence of a decorator rather than a
 * setting — the boundary test asserts that absence so it cannot be added by
 * accident.
 *
 * The controller owns HTTP and the response stream, and nothing else. Which
 * bytes a caller may see is decided behind the service boundary, against the
 * database, on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicProductMediaService } from '../application/public-product-media.service';
import {
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
  PUBLIC_PRODUCT_MEDIA_RENDITIONS,
} from '../domain/public-product-media.policy';
import { isPublicProductMediaError, toHttpException } from '../domain/public-product-media.errors';
import { PublicProductMediaParams } from './schemas/public-product-media.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('publicProductMedia')
@Controller('public/products')
export class PublicProductMediaController {
  constructor(private readonly media: PublicProductMediaService) {}

  @Get(':slug/media/:productMediaId/:rendition')
  @ApiOperation({
    summary: 'Get one published product image',
    description:
      'Streams the requested rendition of one image attached to a PUBLISHED product. ' +
      'Anonymous: no session, cookie or storage credential is involved. Publication is ' +
      're-checked on every request, so unpublishing a product stops delivery immediately ' +
      'even for a caller that already knows the address. Responses are never cached.',
  })
  @ApiParam({ name: 'slug', description: 'The server-owned product slug.' })
  @ApiParam({
    name: 'productMediaId',
    format: 'uuid',
    description:
      'Opaque identity of the current product-image association. It is not a storage ' +
      'reference and grants no access on its own.',
  })
  @ApiParam({
    name: 'rendition',
    enum: PUBLIC_PRODUCT_MEDIA_RENDITIONS,
    description: '`thumbnail` for product cards, `catalog-preview` for detail galleries.',
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
    description: 'Malformed slug, media id or rendition.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No image is publicly available at this address. Returned identically for an unknown ' +
      'product, an unpublished or archived product, a withdrawn category, an unknown or ' +
      'foreign association, and an image whose rendition is not ready.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: PublicProductMediaParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.media.open(params, abort.signal);
    } catch (error: unknown) {
      throw isPublicProductMediaError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    // `once` because destroying twice is pointless, and the listener dies with
    // the request either way.
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
 * An `AbortController` tied to the client's connection.
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
