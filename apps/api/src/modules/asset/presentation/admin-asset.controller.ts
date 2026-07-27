/**
 * The three Admin asset-intake operations (`APP2-B01`).
 *
 *   POST /api/admin/assets/upload   — adminAsset_upload
 *   GET  /api/admin/assets/:assetId — adminAsset_detail
 *   GET  /api/admin/assets          — adminAsset_list
 *
 * The controller owns the HTTP contract and nothing else: guards, status code,
 * documentation, and turning a transport-free `AssetIntakeError` into the
 * canonical exception. Every rule about multipart shape, idempotency, storage
 * and lifecycle lives behind the service boundary.
 *
 * The upload handler takes the raw request rather than a `@Body()`: binding a
 * body would make Nest buffer 25 MiB in memory before the handler ever ran,
 * which is precisely what the streaming design exists to avoid. For the same
 * reason the login-only JSON-body guard is **not** applied here.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { CurrentStaff } from '../../identity/presentation/current-staff.decorator';
import type { ResolvedStaffSession } from '../../identity/application/resolve-staff-session.service';
import { AssetIntakeService } from '../application/asset-intake.service';
import { AssetCatalogQuery } from '../application/asset-catalog.query';
import type {
  AssetDetailView,
  AssetListView,
  AssetUploadReceipt,
} from '../application/asset-projection';
import { isAssetIntakeError, toHttpException } from '../domain/asset-intake.errors';
import { MAX_UPLOAD_BYTES } from '../domain/asset-intake.policy';
import {
  AdminAssetDetailResponse,
  AdminAssetListResponse,
  AdminAssetUploadReceiptResponse,
} from './schemas/admin-asset.response';
import {
  AssetIdParam,
  ListAssetsQuery,
  uploadMultipartSchema,
} from './schemas/admin-asset.request';

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

@ApiTags('adminAsset')
@ApiCookieAuth('adminSession')
@Controller('admin/assets')
@UseGuards(AuthenticatedAdminGuard)
export class AdminAssetController {
  constructor(
    private readonly intake: AssetIntakeService,
    private readonly catalog: AssetCatalogQuery,
  ) {}

  @Post('upload')
  // The upload is the one state-changing route here, so it carries the exact
  // Origin allowlist in addition to the session guard (ADR-APP1-001 §6).
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('ASSET_UPLOAD_ACCEPTED', 'Asset accepted for inspection.')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload one product image',
    description:
      'Streams a single PNG, JPEG or WebP image of at most ' +
      `${MAX_UPLOAD_BYTES} bytes into private storage and hands it to inspection. ` +
      'Idempotent: repeating the request with the same Idempotency-Key and the same ' +
      'file returns the original receipt and writes no second object.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8-128 characters of A-Z a-z 0-9 . _ : - identifying this upload attempt.',
  })
  @ApiBody({ schema: uploadMultipartSchema() })
  @ApiExtraModels(AdminAssetUploadReceiptResponse)
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'The image is stored and queued for inspection.',
    schema: envelopeOf(AdminAssetUploadReceiptResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed multipart, metadata or idempotency key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 408,
    description: 'The upload exceeded the hard duration.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate, conflicting or stale upload attempt.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 413,
    description: 'The file exceeds the maximum permitted size.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported media type or signature mismatch.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 500,
    description: 'The stored upload record could not be read safely.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async upload(
    @Req() request: IncomingMessage,
    @CurrentStaff() session: ResolvedStaffSession,
  ): Promise<AssetUploadReceipt> {
    return this.guarded(() => this.intake.upload(request, session.adminId));
  }

  @Get(':assetId')
  @ApiSuccessCode('ASSET_DETAIL_READ', 'Asset retrieved.')
  @ApiOperation({
    summary: 'Get one product-image asset',
    description:
      'Returns the safe intake view. Assets outside product media are reported as not found.',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiExtraModels(AdminAssetDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The asset.',
    schema: envelopeOf(AdminAssetDetailResponse),
  })
  @ApiResponse({ status: 404, description: 'No such product-image asset.', schema: ERROR_SCHEMA })
  async detail(@Param() params: AssetIdParam): Promise<AssetDetailView> {
    return this.guarded(() => this.catalog.detail(params.assetId));
  }

  @Get()
  @ApiSuccessCode('ASSET_LIST_READ', 'Assets retrieved.')
  @ApiOperation({
    summary: 'List product-image assets',
    description:
      'Keyset-paginated, newest first. Scoped to product media; there is no offset paging.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mediaType', required: false })
  @ApiExtraModels(AdminAssetListResponse)
  @ApiResponse({
    status: 200,
    description: 'One page of assets.',
    schema: envelopeOf(AdminAssetListResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  async list(@Query() query: ListAssetsQuery): Promise<AssetListView> {
    return this.guarded(() => this.catalog.list(query));
  }

  /**
   * The single translation point from the feature's transport-free error type
   * to the canonical HTTP exception. Anything else propagates untouched and is
   * sanitised by the platform filter, which is the correct treatment for an
   * unreviewed failure.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      throw isAssetIntakeError(error) ? toHttpException(error) : error;
    }
  }
}
