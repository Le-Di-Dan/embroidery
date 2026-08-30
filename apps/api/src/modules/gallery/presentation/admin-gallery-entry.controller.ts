/**
 * The four Admin gallery authoring operations (`APP11-B01`).
 *
 *   GET   /api/admin/gallery-entries       — adminGalleryEntry_list
 *   POST  /api/admin/gallery-entries       — adminGalleryEntry_create
 *   GET   /api/admin/gallery-entries/:id   — adminGalleryEntry_detail
 *   PATCH /api/admin/gallery-entries/:id   — adminGalleryEntry_update
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `AdminGalleryEntryError` into the
 * canonical exception. Every rule about lifecycle, slugs and linked products
 * lives behind the service boundary.
 *
 * There is no fifth route. Media association and publication are `APP11-B02`'s,
 * and the public gallery is `APP11-B03`'s.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
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
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { AdminGalleryEntryQuery } from '../application/admin-gallery-entry.query';
import { AdminGalleryEntryService } from '../application/admin-gallery-entry.service';
import type {
  AdminGalleryEntryDetailView,
  AdminGalleryEntryListView,
} from '../application/admin-gallery-entry.projection';
import { GALLERY_ENTRY_STATUS_FILTERS } from '../domain/admin-gallery-entry.policy';
import { isAdminGalleryEntryError, toHttpException } from '../domain/admin-gallery-entry.errors';
import {
  AdminGalleryEntryDetailResponse,
  AdminGalleryEntryListResponse,
} from './schemas/admin-gallery-entry.response';
import {
  CreateGalleryEntryBody,
  GalleryEntryIdParam,
  ListGalleryEntriesQuery,
  UpdateGalleryEntryBody,
} from './schemas/admin-gallery-entry.request';

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
const UNSUPPORTED_MEDIA = {
  status: 415,
  description: 'The body is not application/json.',
  schema: ERROR_SCHEMA,
} as const;

@ApiTags('adminGalleryEntry')
@ApiCookieAuth('adminSession')
@Controller('admin/gallery-entries')
@UseGuards(AuthenticatedAdminGuard)
export class AdminGalleryEntryController {
  constructor(
    private readonly entries: AdminGalleryEntryService,
    private readonly query: AdminGalleryEntryQuery,
  ) {}

  @Get()
  @ApiSuccessCode('GALLERY_ENTRY_LIST_READ', 'Gallery entries retrieved.')
  @ApiOperation({
    summary: 'List Admin gallery entries',
    description:
      'Keyset-paginated in curated order (`display_order` ascending, ties broken by id). ' +
      'There is no offset paging and no total count. With no status filter the page carries ' +
      'drafts, published and archived entries alike. Each row carries the cover image id and ' +
      'the image count; neither is a media address.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'status', required: false, enum: GALLERY_ENTRY_STATUS_FILTERS })
  @ApiExtraModels(AdminGalleryEntryListResponse)
  @ApiResponse({
    status: 200,
    description: 'One page of gallery entries.',
    schema: envelopeOf(AdminGalleryEntryListResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHORIZED)
  async list(@Query() query: ListGalleryEntriesQuery): Promise<AdminGalleryEntryListView> {
    return this.guarded(() => this.query.list(query));
  }

  @Get(':galleryEntryId')
  @ApiSuccessCode('GALLERY_ENTRY_DETAIL_READ', 'Gallery entry retrieved.')
  @ApiOperation({
    summary: 'Get one Admin gallery entry',
    description:
      'Returns the authoring fields and the ordered asset associations. No storage key, no ' +
      'media URL and no per-image alt text — alt text is derived at render time and has no ' +
      'column (APP11-D01-C1).',
  })
  @ApiParam({ name: 'galleryEntryId', format: 'uuid' })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The gallery entry.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse({ status: 404, description: 'No such gallery entry.', schema: ERROR_SCHEMA })
  async detail(@Param() params: GalleryEntryIdParam): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() => this.query.detail(params.galleryEntryId));
  }

  @Post()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('GALLERY_ENTRY_CREATED', 'Gallery entry created.')
  @ApiOperation({
    summary: 'Create a gallery entry',
    description:
      'Creates a DRAFT. The status is not accepted and cannot be chosen. The slug is supplied ' +
      'once here, must match the canonical public slug grammar, and is immutable afterwards. ' +
      'A linked product is validated when present. The entry has no images until APP11-B02 ' +
      'associates them.',
  })
  @ApiBody({ type: CreateGalleryEntryBody })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 201,
    description: 'The created DRAFT.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, slug grammar or linked product.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN_ORIGIN)
  @ApiResponse({
    status: 409,
    description: 'That gallery address is already in use.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNSUPPORTED_MEDIA)
  async create(@Body() body: CreateGalleryEntryBody): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() =>
      this.entries.create({
        title: body.title,
        slug: body.slug,
        description: body.description,
        displayOrder: body.displayOrder,
        isIndexable: body.isIndexable,
        ...(body.linkedProductId === undefined ? {} : { linkedProductId: body.linkedProductId }),
        ...(body.seoTitle === undefined ? {} : { seoTitle: body.seoTitle }),
        ...(body.seoDescription === undefined ? {} : { seoDescription: body.seoDescription }),
      }),
    );
  }

  @Patch(':galleryEntryId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('GALLERY_ENTRY_UPDATED', 'Gallery entry updated.')
  @ApiOperation({
    summary: 'Update a gallery entry',
    description:
      'Patches the editable authoring fields. `slug`, `status`, `archivedAt` and any asset ' +
      'field are not part of this body and are rejected: renaming, publishing, archiving and ' +
      'changing media are not reachable from here. Omitted fields keep their stored value; ' +
      'sending `linkedProductId`, `seoTitle` or `seoDescription` as null clears it.',
  })
  @ApiParam({ name: 'galleryEntryId', format: 'uuid' })
  @ApiBody({ type: UpdateGalleryEntryBody })
  @ApiExtraModels(AdminGalleryEntryDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The updated gallery entry.',
    schema: envelopeOf(AdminGalleryEntryDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, an empty patch, a forbidden field or an unusable linked product.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN_ORIGIN)
  @ApiResponse({ status: 404, description: 'No such gallery entry.', schema: ERROR_SCHEMA })
  @ApiResponse(UNSUPPORTED_MEDIA)
  async update(
    @Param() params: GalleryEntryIdParam,
    @Body() body: UpdateGalleryEntryBody,
  ): Promise<AdminGalleryEntryDetailView> {
    return this.guarded(() =>
      this.entries.update({
        galleryEntryId: params.galleryEntryId,
        fields: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.displayOrder === undefined ? {} : { displayOrder: body.displayOrder }),
          ...(body.isIndexable === undefined ? {} : { isIndexable: body.isIndexable }),
          // null is an explicit clear, undefined means the patch omitted it.
          ...(body.linkedProductId === undefined ? {} : { linkedProductId: body.linkedProductId }),
          ...(body.seoTitle === undefined ? {} : { seoTitle: body.seoTitle }),
          ...(body.seoDescription === undefined ? {} : { seoDescription: body.seoDescription }),
        },
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
