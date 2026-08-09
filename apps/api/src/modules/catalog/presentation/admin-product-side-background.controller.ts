/**
 * The one Admin Side-background operation (`APP3-B02A`).
 *
 *   GET /api/admin/products/:productId/sides/:sideId/background
 *       — adminProductSideBackground_get
 *
 * The route spelling is derived, not invented: it mirrors the accepted public
 * suffix `.../sides/:side/background` under the existing Admin Product
 * hierarchy (`admin/products/:productId/...`, as `placement` and `publication`
 * already do), with ids in place of the public slug and code. The operation id
 * follows from the class name — `createOperationId` builds
 * `<controller minus Controller, lower-cased>_<method>`.
 *
 * `AuthenticatedAdminGuard` is the whole authorization story at this layer.
 * `StaffOriginGuard` is deliberately absent: it exists to protect *mutations*
 * from cross-origin form posts, and this route is a `GET` that writes nothing.
 * Adding it would also break the plain `<img src>` an authoring screen uses,
 * which sends no Origin at all.
 *
 * The controller owns HTTP and the response stream, and nothing else. Which
 * bytes a caller may see is decided behind the service boundary, against the
 * database, on every single request.
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
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { AdminSideBackgroundService } from '../application/admin-side-background.service';
import {
  ADMIN_SIDE_BACKGROUND_CACHE_CONTROL,
  ADMIN_SIDE_BACKGROUND_CONTENT_DISPOSITION,
  ADMIN_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS,
  ADMIN_SIDE_BACKGROUND_MEDIA_TYPES,
} from '../domain/admin-side-background.policy';
import {
  isAdminSideBackgroundError,
  toHttpException,
} from '../domain/admin-side-background.errors';
import { AdminSideBackgroundParams } from './schemas/admin-side-background.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const [SIDE_BACKGROUND_CONTENT_TYPE] = ADMIN_SIDE_BACKGROUND_MEDIA_TYPES;

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('adminProductSideBackground')
@ApiCookieAuth('adminSession')
@Controller('admin/products/:productId/sides/:sideId/background')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductSideBackgroundController {
  constructor(private readonly backgrounds: AdminSideBackgroundService) {}

  @Get()
  @ApiOperation({
    summary: 'Get one Product Side background for placement authoring',
    description:
      'Streams the editor-safe background of one Product Side to an authenticated Admin, for ' +
      'authoring Embroidery Areas on the real image. Publication is deliberately **not** ' +
      'required: placement is authored while a Product is still a draft, so requiring it would ' +
      'make the screen work only for products that no longer need setting up. What is required ' +
      'is an authenticated Admin and a Side that belongs to the named Product. The Asset lane, ' +
      'the background association and the derivative are re-checked on every request, so ' +
      'replacing a background takes effect immediately. Responses are never cached.',
  })
  @ApiParam({ name: 'productId', description: 'The Product UUID, never the public slug.' })
  @ApiParam({
    name: 'sideId',
    description:
      'The Product Side UUID. It must belong to the named Product; a Side of another Product is ' +
      'refused identically to one that does not exist.',
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
        description:
          'Always `no-store`. These bytes may belong to a product that was never published, so ' +
          'no shared or browser cache may retain them.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed product or side id.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 401,
    description: 'No authenticated Admin session.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No background is available at this address. Returned identically for an unknown product, ' +
      'an unknown side, a side belonging to a different product, a side with no background ' +
      'association, a withdrawn or tombstoned Asset, and a background whose editor-safe ' +
      'derivative is absent, unready, watermarked or incompletely described.',
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
    @Param() params: AdminSideBackgroundParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.backgrounds.open(params, abort.signal);
    } catch (error: unknown) {
      throw isAdminSideBackgroundError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', ADMIN_SIDE_BACKGROUND_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', ADMIN_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted,
      // and inventing one would describe the object falsely.
      disposition: ADMIN_SIDE_BACKGROUND_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the
      // provider's count and the persisted `byte_size` agree.
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
