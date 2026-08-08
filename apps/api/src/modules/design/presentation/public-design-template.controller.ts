/**
 * The two public Design Template operations (`APP3-B05`).
 *
 *   GET /api/public/design-templates        — publicDesignTemplate_list
 *   GET /api/public/design-templates/:slug  — publicDesignTemplate_detail
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * boundary spec asserts that absence so one cannot be added by accident. Neither
 * operation takes a staff session, a Design Session cookie, an Origin allowlist
 * or a storage credential — and neither may: `IMP-D043` binds the Session
 * credential to a Session's own resources, and a published Template is not one.
 *
 * The controller owns HTTP and nothing else. Which Templates a public caller may
 * see is decided behind the query boundary, against the database, on every
 * request — including whether the placement they are scoped to is *still*
 * publicly designable, which is a fact that changes without the Template being
 * touched.
 *
 * Byte delivery is not here and is not a third operation. `APP3-B05A` owns
 * published Template asset delivery under its own authorization proof
 * (published Template **plus** published Version), and §6.24.2 keeps this
 * checkpoint at exactly two JSON reads for that reason.
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
import { PublicDesignTemplateQuery } from '../application/public-design-template.query';
import type {
  PublicTemplateDetailView,
  PublicTemplateListView,
} from '../application/public-design-template.projection';
import {
  PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL,
  PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE,
} from '../domain/public-design-template.policy';
import {
  isPublicDesignTemplateError,
  toHttpException,
} from '../domain/public-design-template.errors';
import {
  PublicDesignTemplateListQueryDto,
  PublicDesignTemplateSlugParam,
} from './schemas/public-design-template.request';
import {
  PublicDesignTemplateDetailResponse,
  PublicDesignTemplateListResponse,
  PublicDesignTemplateScopeResponse,
  PublicDesignTemplateSummaryResponse,
  PublicDesignTemplateVersionResponse,
} from './schemas/public-design-template.response';

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
  'Responses are never stored. Publication and placement eligibility are re-read on every ' +
  'request, and there is no cache-invalidation consumer in this system, so a stored copy could ' +
  'keep an unpublished or archived template visible.';

const SCOPE_NOTE =
  'Compatibility is the exact `productId` + `productSideId` + `embroideryAreaId` triple. All ' +
  'three are required and there is no product-wide, side-wide or wildcard match: a template is ' +
  'compatible with one embroidery area and with nothing else.';

@ApiTags('publicDesignTemplate')
@Controller('public/design-templates')
export class PublicDesignTemplateController {
  constructor(private readonly templates: PublicDesignTemplateQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_DESIGN_TEMPLATE_LIST_READ', 'Published design templates retrieved.')
  @ApiOperation({
    operationId: 'publicDesignTemplate_list',
    summary: 'List published design templates for one embroidery area',
    description:
      'Returns the published templates compatible with one embroidery area, newest first, page ' +
      'by page. Anonymous: no session or cookie is involved, and the caller cannot select ' +
      'lifecycle visibility — there is no parameter for it, and drafts, archived and unpublished ' +
      'templates are excluded by the query itself. A template whose product has since left the ' +
      'public catalogue, or whose side or area has been retired, is omitted without the template ' +
      'being changed in any way. ' +
      SCOPE_NOTE +
      ' Pagination is keyset: `nextCursor` is opaque, bound to the scope it was issued under, ' +
      'and absent on the last page. ' +
      CACHE_NOTE,
  })
  @ApiQuery({ name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'productSideId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'embroideryAreaId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a prior page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE },
  })
  @ApiExtraModels(
    PublicDesignTemplateListResponse,
    PublicDesignTemplateSummaryResponse,
    PublicDesignTemplateScopeResponse,
    PublicDesignTemplateVersionResponse,
  )
  @ApiResponse({
    status: 200,
    description:
      'A page of published templates. Empty when the area holds none and, identically, when the ' +
      'scope is no longer publicly designable.',
    schema: envelopeOf(PublicDesignTemplateListResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'An unknown query parameter, a missing or malformed scope id, an out-of-range page size, ' +
      'or a cursor that is malformed or was issued for a different scope.',
    schema: ERROR_SCHEMA,
  })
  async list(@Query() query: PublicDesignTemplateListQueryDto): Promise<PublicTemplateListView> {
    return this.guarded(() =>
      this.templates.list({
        productId: query.productId,
        productSideId: query.productSideId,
        embroideryAreaId: query.embroideryAreaId,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_DESIGN_TEMPLATE_DETAIL_READ', 'Published design template retrieved.')
  @ApiOperation({
    operationId: 'publicDesignTemplate_detail',
    summary: 'Get one published design template by slug',
    description:
      'Resolves a published template by its server-owned slug and returns the published ' +
      'immutable version — the highest version that carries a publication timestamp, which is ' +
      'not necessarily the highest version that exists. An unknown slug, a draft, an archived ' +
      'template, one that was unpublished, one whose versions were never published, and one ' +
      'whose product, side or area is no longer publicly designable all return the same 404: a ' +
      'public caller must not be able to tell unreleased store work from work that never ' +
      'existed. ' +
      CACHE_NOTE,
  })
  @ApiParam({ name: 'slug', description: 'The server-owned public template slug.' })
  @ApiExtraModels(
    PublicDesignTemplateDetailResponse,
    PublicDesignTemplateScopeResponse,
    PublicDesignTemplateVersionResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'The published template and its published Design Document.',
    schema: envelopeOf(PublicDesignTemplateDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'The slug is not well formed.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No published design template is available at that slug.',
    schema: ERROR_SCHEMA,
  })
  async detail(@Param() params: PublicDesignTemplateSlugParam): Promise<PublicTemplateDetailView> {
    return this.guarded(() => this.templates.detail(params.slug));
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
      throw isPublicDesignTemplateError(error) ? toHttpException(error) : error;
    }
  }
}
