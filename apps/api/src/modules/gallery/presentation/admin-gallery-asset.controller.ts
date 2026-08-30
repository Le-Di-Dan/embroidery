/**
 * The two Admin gallery-asset operations (`APP11-B03A`).
 *
 *   POST /api/admin/gallery-assets                        — adminGalleryAsset_create
 *   GET  /api/admin/gallery-assets/:assetId/:rendition    — adminGalleryAsset_preview
 *
 * Together they close `FU-APP11-B03-01`: the create is the only delivered way
 * to produce an asset `APP11-B02` will attach and `APP11-B03` will serve, and
 * the preview is what lets an operator see the result before attaching it.
 * Finding and selecting a prepared asset needs no operation here at all —
 * `adminAsset_list` and `adminAsset_detail` answer that under `scope=GALLERY`.
 *
 * A class of its own rather than more methods on `AdminAssetController`: this
 * is a different published domain (`adminGalleryAsset`), and that file already
 * carries the streaming multipart intake whose contract must stay readable on
 * its own.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, the response stream, and turning a transport-free
 * `GalleryAssetPreparationError` into the canonical exception. Every rule about
 * eligibility, object copying, concurrency and compensation lives behind the
 * service boundary.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { AdminGalleryAssetPreparationService } from '../application/admin-gallery-asset-preparation.service';
import { AdminGalleryAssetPreviewService } from '../application/admin-gallery-asset-preview.service';
import type { AdminGalleryAssetView } from '../application/admin-gallery-asset.projection';
import {
  isGalleryAssetPreparationError,
  toHttpException,
} from '../domain/gallery-asset-preparation.errors';
import {
  PUBLIC_GALLERY_MEDIA_RENDITIONS,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
} from '../domain/public-gallery-media.policy';
import { AdminGalleryAssetResponse } from './schemas/admin-gallery-asset.response';
import {
  AdminGalleryAssetPreviewParams,
  PrepareGalleryAssetBody,
} from './schemas/admin-gallery-asset.request';

/** Envelope + `data` for one documented success payload. */
function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const UNAUTHORIZED = {
  status: 401,
  description: 'No live Admin session.',
  schema: ERROR_SCHEMA,
} as const;

/** Structural types: the controller sets headers without importing Express. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('adminGalleryAsset')
@ApiCookieAuth('adminSession')
@Controller('admin/gallery-assets')
@UseGuards(AuthenticatedAdminGuard)
export class AdminGalleryAssetController {
  constructor(
    private readonly preparation: AdminGalleryAssetPreparationService,
    private readonly previews: AdminGalleryAssetPreviewService,
  ) {}

  @Post()
  // The one state-changing route here, so it carries the exact Origin allowlist
  // and the JSON body guard in addition to the session guard (ADR-APP1-001 §6).
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('GALLERY_ASSET_PREPARED', 'Gallery image prepared.')
  @ApiOperation({
    operationId: 'adminGalleryAsset_create',
    summary: 'Prepare a gallery image from an accepted product image',
    description:
      'Creates a **new** public gallery asset by copying an accepted product image and its two ' +
      'display renditions to their own object keys. The source is never modified: it keeps its ' +
      'id, its `CATALOG_MEDIA` kind, its `PRODUCTION_SENSITIVE` classification, its `ACCEPTED` ' +
      'status and every product association, so a product already published from it keeps ' +
      'delivering. The response carries a different id, and both of its renditions are ready ' +
      'before this call returns — so the asset can be attached with ' +
      '`adminGalleryEntry_replaceAssets` and served publicly immediately. The lane, the state, ' +
      'the storage keys and the renditions are all policy-owned and cannot be requested. ' +
      'Requires `expectedSourceUpdatedAt`, the `updatedAt` token last read for the source; a ' +
      'stale value is rejected and nothing is created. Repeating the call prepares a second, ' +
      'independent asset — there is no promotion idempotency.',
  })
  @ApiBody({ type: PrepareGalleryAssetBody })
  @ApiExtraModels(AdminGalleryAssetResponse)
  @ApiResponse({
    status: 201,
    description: 'The prepared gallery asset.',
    schema: envelopeOf(AdminGalleryAssetResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'The source cannot be prepared. Returned identically for an unknown asset, an asset ' +
      'outside product media — a customer upload or an already-public image — one that is not ' +
      'accepted, one that is rejected, deletion-pending or tombstoned, and one whose display ' +
      'renditions are not ready.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'The source changed since it was read; nothing was created.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable; nothing was created.',
    schema: ERROR_SCHEMA,
  })
  async create(@Body() body: PrepareGalleryAssetBody): Promise<AdminGalleryAssetView> {
    try {
      return await this.preparation.prepare({
        sourceAssetId: body.sourceAssetId,
        expectedSourceUpdatedAt: new Date(body.expectedSourceUpdatedAt),
      });
    } catch (error: unknown) {
      throw isGalleryAssetPreparationError(error) ? toHttpException(error) : error;
    }
  }

  @Get(':assetId/:rendition')
  @ApiOperation({
    operationId: 'adminGalleryAsset_preview',
    summary: 'Preview one rendition of a gallery image',
    description:
      'Streams the requested rendition of a public gallery asset to an authenticated operator, ' +
      'so an image can be reviewed before — and after — it is attached to an entry. The asset ' +
      'lane is re-checked on every request: only `GALLERY_MEDIA` / `PUBLIC` assets resolve, ' +
      'and exactly the two renditions the public gallery route serves. No storage key, bucket ' +
      'or signed URL is ever exposed, and responses are never cached.',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiParam({
    name: 'rendition',
    enum: PUBLIC_GALLERY_MEDIA_RENDITIONS,
    description: '`thumbnail` for pickers and cards, `catalog-preview` for the larger image.',
  })
  @ApiProduces(PUBLIC_MEDIA_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The image bytes.',
    content: { [PUBLIC_MEDIA_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
    headers: {
      'Cache-Control': {
        description: 'Always `no-store`.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed id or rendition.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse({
    status: 404,
    description:
      'No gallery image is available at this address. Returned identically for an unknown ' +
      'asset, an asset outside the gallery lane, a tombstoned one, and one whose rendition is ' +
      'not ready.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async preview(
    @Param() params: AdminGalleryAssetPreviewParams,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.previews.open(params, abort.signal);
    } catch (error: unknown) {
      throw isGalleryAssetPreparationError(error) ? toHttpException(error) : error;
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
