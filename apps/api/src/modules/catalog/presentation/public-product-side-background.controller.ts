/**
 * The one public Side-background operation (`APP3-B02`).
 *
 *   GET /api/public/products/:slug/sides/:sideCode/background
 *       — publicProductSideBackground_get
 *
 * Anonymous by construction: no guard is applied, because none belongs here.
 * `AuthenticatedAdminGuard` and `StaffOriginGuard` are opt-in per controller in
 * this codebase, so "public" is the absence of a decorator rather than a
 * setting — the contract test asserts that absence so it cannot be added by
 * accident.
 *
 * The route shares the `public/products` base with the `APP2-B04` catalogue, the
 * `APP2-T01` media route and the `APP3-B01` placement manifest, and collides with
 * none of them: it has four segments after the base where the catalogue detail
 * has one, the manifest has two and the media route has three.
 *
 * The controller owns HTTP and the response stream, and nothing else. Which
 * bytes a caller may see is decided behind the service boundary, against the
 * database, on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicSideBackgroundService } from '../application/public-side-background.service';
import {
  PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL,
  PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION,
  PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS,
  PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES,
} from '../domain/public-side-background.policy';
import {
  isPublicSideBackgroundError,
  toHttpException,
} from '../domain/public-side-background.errors';
import { PublicSideBackgroundParams } from './schemas/public-side-background.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const [SIDE_BACKGROUND_CONTENT_TYPE] = PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES;

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('publicProductSideBackground')
@Controller('public/products')
export class PublicProductSideBackgroundController {
  constructor(private readonly backgrounds: PublicSideBackgroundService) {}

  @Get(':slug/sides/:sideCode/background')
  @ApiOperation({
    summary: 'Get one published product side background',
    description:
      'Streams the approved editor-safe background of one active Product Side of a PUBLISHED ' +
      'product. Anonymous: no session, cookie or storage credential is involved. Publication, ' +
      'category visibility, side activity, the background association and the derivative are ' +
      're-checked on every request, so unpublishing a product, retiring a side or replacing a ' +
      'background stops delivery immediately even for a caller that already knows the address. ' +
      'Responses are never cached.',
  })
  @ApiParam({ name: 'slug', description: 'The server-owned product slug.' })
  @ApiParam({
    name: 'sideCode',
    description:
      "The Product Side's stable public code. It is not a storage reference and grants no " +
      'access on its own.',
  })
  @ApiProduces(SIDE_BACKGROUND_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The editor-safe background bytes.',
    content: {
      [SIDE_BACKGROUND_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } },
    },
    headers: {
      'Cache-Control': {
        description: 'Always `no-store`, so a cache cannot outlive an unpublish or a retirement.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed slug or side code.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No background is publicly available at this address. Returned identically for an unknown ' +
      'product, an unpublished or archived product, a withdrawn category, an unknown or foreign ' +
      'side code, a retired side, and a background whose editor-safe derivative is absent, ' +
      'unready, watermarked or incompletely described.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Background storage is temporarily unavailable, or the stored object contradicts the ' +
      'recorded derivative.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: PublicSideBackgroundParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.backgrounds.open(params, abort.signal);
    } catch (error: unknown) {
      throw isPublicSideBackgroundError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    // `once` because destroying twice is pointless, and the listener dies with
    // the request either way.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted,
      // and inventing one would describe the object falsely.
      disposition: PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the
      // provider's count and the persisted `byte_size` agree, so there is no
      // case in which a length is unknown or would have to be guessed.
      length: stream.contentLengthBytes,
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
