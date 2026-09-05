/**
 * The Admin asset preview operation (`APP12-V02-C2` §14).
 *
 *   GET /api/admin/assets/:assetId/:rendition — adminAsset_preview
 *
 * Separate from `AdminAssetController` by responsibility rather than by size:
 * that controller answers questions about assets in JSON, this one streams
 * bytes. They share the `admin/assets` path and the session guard, and nothing
 * else — the streaming handler owns a client-disconnect watcher and a
 * `StreamableFile` lifecycle that has no counterpart in a JSON read.
 *
 * The route sits one segment deeper than `adminAsset_detail`, so the two never
 * compete: `/assets/:id` is the record and `/assets/:id/:rendition` is one of
 * its images.
 */
import { Controller, Get, Param, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { AdminAssetPreviewService } from '../application/admin-asset-preview.service';
import {
  ADMIN_ASSET_PREVIEW_RENDITIONS,
  ADMIN_PREVIEW_CACHE_CONTROL,
  ADMIN_PREVIEW_CONTENT_DISPOSITION,
  ADMIN_PREVIEW_CONTENT_TYPE,
  ADMIN_PREVIEW_CONTENT_TYPE_OPTIONS,
} from '../domain/admin-asset-preview.policy';
import { ADMIN_ASSET_SCOPES } from '../domain/admin-asset-scope.policy';
import { isAssetIntakeError, toHttpException } from '../domain/asset-intake.errors';
import { AssetPreviewParams, AssetScopeQuery } from './schemas/admin-asset.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The subset of the platform response this handler sets headers on. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

@ApiTags('adminAsset')
@ApiCookieAuth('adminSession')
@Controller('admin/assets')
@UseGuards(AuthenticatedAdminGuard)
export class AdminAssetPreviewController {
  constructor(private readonly previews: AdminAssetPreviewService) {}

  @Get(':assetId/:rendition')
  @ApiOperation({
    operationId: 'adminAsset_preview',
    summary: 'Preview one rendition of an asset',
    description:
      'Streams one processed rendition of an Admin asset to an authenticated operator, so the ' +
      'library shows the image itself rather than a placeholder standing in for it. The lane is ' +
      're-checked on every request — an asset outside the requested `scope` is absent, exactly ' +
      'as `adminAsset_detail` reports it — and only the two derivative renditions the public ' +
      'routes serve can be named. There is no rendition word for an original, so a private ' +
      'original is unreachable here. No storage key, bucket or signed URL is ever exposed, and ' +
      'responses are never cached.',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiParam({
    name: 'rendition',
    enum: ADMIN_ASSET_PREVIEW_RENDITIONS,
    description: '`thumbnail` for library tiles and pickers, `catalog-preview` for a larger view.',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ADMIN_ASSET_SCOPES,
    description:
      'Which asset lane to read, matching `adminAsset_detail`. Defaults to `CATALOG`, the ' +
      'product-media lane the Admin library shows.',
  })
  @ApiProduces(ADMIN_PREVIEW_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The image bytes.',
    content: { [ADMIN_PREVIEW_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
    headers: {
      'Cache-Control': { description: 'Always `no-store`.', schema: { type: 'string' } },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed id, unknown rendition, or unknown scope.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No image is available at this address. Returned identically for an unknown asset, one ' +
      'outside the requested lane, a tombstoned one, and one whose rendition is not yet ready.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async preview(
    @Param() params: AssetPreviewParams,
    @Query() query: AssetScopeQuery,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.previews.open({ ...params, scope: query.scope }, abort.signal);
    } catch (error: unknown) {
      throw isAssetIntakeError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', ADMIN_PREVIEW_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', ADMIN_PREVIEW_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted,
      // and inventing one would describe the object falsely.
      disposition: ADMIN_PREVIEW_CONTENT_DISPOSITION,
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
