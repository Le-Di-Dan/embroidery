/**
 * The two public gallery reads (`APP11-B03`).
 *
 *   GET /api/public/gallery-entries        — publicGalleryEntry_list
 *   GET /api/public/gallery-entries/:slug  — publicGalleryEntry_detail
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * contract suite asserts that absence so it cannot be added by accident.
 * Neither operation takes a session, a cookie, an Origin allowlist or a storage
 * credential.
 *
 * The controller owns HTTP and nothing else: which entries exist for an
 * anonymous caller is decided behind the query boundary, against the database,
 * on every request. It shares its base path with the media controller; the
 * routes cannot collide because the media route has four path segments after
 * the base and these have zero and one.
 */
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
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
import { PublicGalleryEntryQuery } from '../application/public-gallery-entry.query';
import type { PublicGalleryEntryListView } from '../application/public-gallery-entry.query';
import type { PublicGalleryEntryDetailView } from '../application/public-gallery-entry.projection';
import { PUBLIC_GALLERY_CACHE_CONTROL } from '../domain/public-gallery-entry.policy';
import { isPublicGalleryEntryError, toHttpException } from '../domain/public-gallery-entry.errors';
import {
  PublicGalleryEntryListQueryDto,
  PublicGalleryEntrySlugParam,
} from './schemas/public-gallery-entry.request';
import {
  PublicGalleryAssetResponse,
  PublicGalleryEntryDetailResponse,
  PublicGalleryEntryListResponse,
  PublicGalleryEntrySeoResponse,
  PublicGalleryEntrySummaryResponse,
  PublicGalleryLinkedProductResponse,
} from './schemas/public-gallery-entry.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Envelope + `data` for one documented success payload. */
function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

const CACHE_NOTE =
  'Responses are never stored. Publication and image eligibility are re-read on every ' +
  'request, and there is no cache-invalidation consumer in this system, so a stored copy ' +
  'could keep an unpublished entry or a withdrawn image visible.';

@ApiTags('publicGalleryEntry')
@Controller('public/gallery-entries')
export class PublicGalleryEntryController {
  constructor(private readonly gallery: PublicGalleryEntryQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_GALLERY_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_GALLERY_ENTRY_LIST_READ', 'Published gallery entries retrieved.')
  @ApiOperation({
    operationId: 'publicGalleryEntry_list',
    summary: 'List published gallery entries',
    description:
      'Returns published gallery entries in curated order, page by page. Anonymous: no ' +
      'session or cookie is involved, and the caller cannot select lifecycle visibility — ' +
      'there is no parameter for it, and drafts and archived entries are excluded by the ' +
      'query itself. A `noindex` entry is still listed: indexability is an SEO directive, ' +
      'not a visibility flag. An entry whose images are all currently undeliverable is ' +
      'omitted, because an image-led card without an image is not a valid projection. ' +
      'Pagination is keyset: `nextCursor` is opaque and null on the last page. ' +
      CACHE_NOTE,
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a prior page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiExtraModels(PublicGalleryEntryListResponse, PublicGalleryEntrySummaryResponse)
  @ApiResponse({
    status: 200,
    description: 'A page of published gallery entries.',
    schema: envelopeOf(PublicGalleryEntryListResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'An unknown query parameter, an out-of-range page size, or a malformed cursor.',
    schema: ERROR_SCHEMA,
  })
  async list(@Query() query: PublicGalleryEntryListQueryDto): Promise<PublicGalleryEntryListView> {
    return this.guarded(() => this.gallery.list({ cursor: query.cursor, limit: query.limit }));
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_GALLERY_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_GALLERY_ENTRY_DETAIL_READ', 'Published gallery entry retrieved.')
  @ApiOperation({
    operationId: 'publicGalleryEntry_detail',
    summary: 'Get one published gallery entry by slug',
    description:
      'Resolves a published gallery entry by its immutable server-owned slug. An unknown ' +
      'slug, a draft, an archived entry and an entry with no currently deliverable image ' +
      'all return the same 404: a public caller must not be able to tell unreleased work ' +
      'from work that never existed. A `noindex` published entry resolves normally. The ' +
      'linked product appears only when it is itself publicly visible, and a non-public ' +
      'one never hides the gallery entry. ' +
      CACHE_NOTE,
  })
  @ApiParam({ name: 'slug', description: 'The immutable server-owned gallery slug.' })
  @ApiExtraModels(
    PublicGalleryEntryDetailResponse,
    PublicGalleryAssetResponse,
    PublicGalleryEntrySeoResponse,
    PublicGalleryLinkedProductResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'The published gallery entry.',
    schema: envelopeOf(PublicGalleryEntryDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'The slug is not well formed.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No published gallery entry is available at that address.',
    schema: ERROR_SCHEMA,
  })
  async detail(
    @Param() params: PublicGalleryEntrySlugParam,
  ): Promise<PublicGalleryEntryDetailView> {
    return this.guarded(() => this.gallery.detail(params.slug));
  }

  /**
   * Translates the transport-free domain error into the canonical exception.
   * Anything else propagates untouched, so an unexpected failure is redacted by
   * the global filter instead of being reshaped into a misleading 4xx here.
   */
  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      throw isPublicGalleryEntryError(error) ? toHttpException(error) : error;
    }
  }
}
