/**
 * The three Admin gallery media and publication operations (`APP11-B02`).
 *
 *   PUT    /api/admin/gallery-entries/:id/assets      — adminGalleryEntry_replaceAssets
 *   POST   /api/admin/gallery-entries/:id/publication — adminGalleryEntry_publish
 *   DELETE /api/admin/gallery-entries/:id/publication — adminGalleryEntry_unpublish
 *
 * A controller of its own rather than three more methods on
 * `AdminGalleryEntryController`: that file stands at 263 of its 400-line limit
 * and media selection plus lifecycle is a distinct responsibility from
 * authoring. The split changes no public identifier — `AdminGalleryEntryLifecycleController`
 * is registered in `CONTROLLER_DOMAIN_KEYS` as `adminGalleryEntry`, so the three
 * operations join the family `APP11-B01` already published instead of minting an
 * `adminGalleryEntryLifecycle_*` family because of a file-layout decision.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `AdminGalleryEntryError` into the
 * canonical exception. Every rule about ordering, eligibility, readiness and
 * concurrency lives behind the service boundary.
 */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { AdminGalleryEntryLifecycleService } from '../application/admin-gallery-entry-lifecycle.service';
import type { AdminGalleryEntryDetailView } from '../application/admin-gallery-entry.projection';
import { isAdminGalleryEntryError, toHttpException } from '../domain/admin-gallery-entry.errors';
import { AdminGalleryEntryDetailResponse } from './schemas/admin-gallery-entry.response';
import { GalleryEntryIdParam } from './schemas/admin-gallery-entry.request';
import {
  PublishGalleryEntryBody,
  ReplaceGalleryEntryAssetsBody,
  UnpublishGalleryEntryBody,
} from './schemas/admin-gallery-entry-lifecycle.request';

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
const FORBIDDEN_ORIGIN = {
  status: 403,
  description: 'The request states an origin outside the Admin allowlist.',
  schema: ERROR_SCHEMA,
} as const;
const NOT_FOUND = {
  status: 404,
  description: 'No such gallery entry.',
  schema: ERROR_SCHEMA,
} as const;
const UNSUPPORTED_MEDIA = {
  status: 415,
  description: 'The body is not application/json.',
  schema: ERROR_SCHEMA,
} as const;

const TOKEN_DESCRIPTION =
  'Requires `expectedUpdatedAt`, the `updatedAt` token last read for this entry. A stale ' +
  'value is rejected as `GALLERY_ENTRY_VERSION_CONFLICT` rather than overwriting a concurrent ' +
  'change, and a successful write advances the token.';

@ApiTags('adminGalleryEntry')
@ApiCookieAuth('adminSession')
@Controller('admin/gallery-entries')
@UseGuards(AuthenticatedAdminGuard, StaffOriginGuard, StaffJsonBodyGuard)
export class AdminGalleryEntryLifecycleController {
  constructor(private readonly lifecycle: AdminGalleryEntryLifecycleService) {}

  @Put(':galleryEntryId/assets')
  @ApiSuccessCode('GALLERY_ENTRY_ASSETS_REPLACED', 'Gallery entry images updated.')
  @ApiOperation({
    summary: 'Replace the ordered gallery images',
    description:
      'Stores the complete intended selection. This is replacement, not append: any image ' +
      'absent from `assetIds` is detached, and the array order becomes the display order with ' +
      'position 0 as the cover. An empty array clears the selection, which is a valid ' +
      'authoring state — publication then refuses until at least one eligible image is ' +
      'attached. Every id must be a public gallery image; a private, production or unknown ' +
      'asset is refused identically, and a refusal changes nothing. Detaching an image never ' +
      'deletes the asset or its derivatives. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'galleryEntryId', format: 'uuid' })
  @ApiBody({ type: ReplaceGalleryEntryAssetsBody })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The gallery entry with its new ordered selection.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid body, a duplicate image (`GALLERY_ENTRY_ASSET_DUPLICATE`), or an image that ' +
      'cannot appear in the gallery (`GALLERY_ENTRY_ASSET_NOT_ELIGIBLE`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN_ORIGIN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description: 'Stale `expectedUpdatedAt` (`GALLERY_ENTRY_VERSION_CONFLICT`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNSUPPORTED_MEDIA)
  async replaceAssets(
    @Param() params: GalleryEntryIdParam,
    @Body() body: ReplaceGalleryEntryAssetsBody,
  ): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() =>
      this.lifecycle.replaceAssets({
        galleryEntryId: params.galleryEntryId,
        assetIds: body.assetIds,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      }),
    );
  }

  @Post(':galleryEntryId/publication')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('GALLERY_ENTRY_PUBLISHED', 'Gallery entry published.')
  @ApiOperation({
    summary: 'Publish a gallery entry',
    description:
      'Moves a DRAFT to PUBLISHED. Readiness is recomputed inside the transaction from ' +
      'persisted state — a non-empty title, a slug, a non-empty description and at least one ' +
      'attached image that is still eligible for public delivery — so a readiness answer the ' +
      'client is holding is never trusted. A linked product, SEO text and `isIndexable` are ' +
      'deliberately not required: a `noindex` entry is publishable. An ARCHIVED entry cannot ' +
      'be published here. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'galleryEntryId', format: 'uuid' })
  @ApiBody({ type: PublishGalleryEntryBody })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The published gallery entry.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN_ORIGIN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'Stale `expectedUpdatedAt` (`GALLERY_ENTRY_VERSION_CONFLICT`), a state that cannot be ' +
      'published (`GALLERY_ENTRY_PUBLISH_NOT_ALLOWED`), or unmet requirements ' +
      '(`GALLERY_ENTRY_PUBLICATION_NOT_READY`, whose `errors[].code` lists the unsatisfied ' +
      'requirement codes).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNSUPPORTED_MEDIA)
  async publish(
    @Param() params: GalleryEntryIdParam,
    @Body() body: PublishGalleryEntryBody,
  ): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() =>
      this.lifecycle.publish({
        galleryEntryId: params.galleryEntryId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      }),
    );
  }

  @Delete(':galleryEntryId/publication')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('GALLERY_ENTRY_UNPUBLISHED', 'Gallery entry unpublished.')
  @ApiOperation({
    summary: 'Unpublish a gallery entry',
    description:
      'Moves a PUBLISHED entry back to DRAFT, removing public visibility by lifecycle state ' +
      'alone. This deletes nothing and archives nothing: the title, slug, description, linked ' +
      'product, both SEO fields and the whole ordered image selection all remain, ' +
      '`archivedAt` is never written, and the entry becomes an editable draft again. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'galleryEntryId', format: 'uuid' })
  @ApiBody({ type: UnpublishGalleryEntryBody })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The unpublished gallery entry, back in DRAFT.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN_ORIGIN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'Stale `expectedUpdatedAt` (`GALLERY_ENTRY_VERSION_CONFLICT`) or a state that cannot be ' +
      'unpublished (`GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNSUPPORTED_MEDIA)
  async unpublish(
    @Param() params: GalleryEntryIdParam,
    @Body() body: UnpublishGalleryEntryBody,
  ): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() =>
      this.lifecycle.unpublish({
        galleryEntryId: params.galleryEntryId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      }),
    );
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
      throw isAdminGalleryEntryError(error) ? toHttpException(error) : error;
    }
  }
}
