/**
 * The two public catalog operations (`APP2-B04`, queries Q-01 and Q-02).
 *
 *   GET /api/public/products        — publicProduct_list
 *   GET /api/public/products/:slug  — publicProduct_detail
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * boundary test asserts that absence so it cannot be added by accident. Neither
 * operation takes a session, a cookie, an Origin allowlist or a storage
 * credential.
 *
 * The controller owns HTTP and nothing else: which products exist for an
 * anonymous caller is decided behind the query boundary, against the database,
 * on every request. It shares the `public/products` base path with the
 * `APP2-T01` media controller; the routes cannot collide because the media
 * route has four path segments after the base and these have zero and one.
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
import { PublicProductQuery } from '../application/public-product.query';
import type { PublicProductListView } from '../application/public-product.query';
import type { PublicProductDetailView } from '../application/public-product.projection';
import { PUBLIC_CATALOG_CACHE_CONTROL } from '../domain/public-product-catalog.policy';
import {
  isPublicProductCatalogError,
  toHttpException,
} from '../domain/public-product-catalog.errors';
import { APP2_CATEGORY_SLUGS } from '../domain/product-draft.policy';
import {
  PublicProductListQueryDto,
  PublicProductSlugParam,
} from './schemas/public-product.request';
import {
  PublicCategoryResponse,
  PublicMediaReferenceResponse,
  PublicPriceResponse,
  PublicProductDetailResponse,
  PublicProductListResponse,
  PublicProductSeoResponse,
  PublicProductSummaryResponse,
} from './schemas/public-product.response';

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
  'Responses are never stored. Publication is re-read on every request, and there is no ' +
  'cache-invalidation consumer in this system, so a stored copy could keep an unpublished ' +
  'product visible.';

@ApiTags('publicProduct')
@Controller('public/products')
export class PublicProductController {
  constructor(private readonly catalog: PublicProductQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_PRODUCT_LIST_READ', 'Published products retrieved.')
  @ApiOperation({
    operationId: 'publicProduct_list',
    summary: 'List published products',
    description:
      'Returns published products in editorial order, page by page. Anonymous: no session ' +
      'or cookie is involved, and the caller cannot select lifecycle visibility — there is ' +
      'no parameter for it, and drafts and archived products are excluded by the query ' +
      'itself. Pagination is keyset: `nextCursor` is opaque, bound to the filter it was ' +
      'issued under, and null on the last page. ' +
      CACHE_NOTE,
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a prior page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'categorySlug', required: false, enum: APP2_CATEGORY_SLUGS })
  @ApiExtraModels(
    PublicProductListResponse,
    PublicProductSummaryResponse,
    PublicCategoryResponse,
    PublicPriceResponse,
    PublicMediaReferenceResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'A page of published products.',
    schema: envelopeOf(PublicProductListResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'An unknown query parameter, an out-of-range page size, or a cursor that is ' +
      'malformed or was issued for a different filter.',
    schema: ERROR_SCHEMA,
  })
  async list(@Query() query: PublicProductListQueryDto): Promise<PublicProductListView> {
    return this.guarded(() =>
      this.catalog.list({
        cursor: query.cursor,
        limit: query.limit,
        categorySlug: query.categorySlug,
      }),
    );
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_PRODUCT_DETAIL_READ', 'Published product retrieved.')
  @ApiOperation({
    operationId: 'publicProduct_detail',
    summary: 'Get one published product by slug',
    description:
      'Resolves a published product by its immutable server-owned slug. An unknown slug, a ' +
      'draft, an archived product and a product without a public category all return the ' +
      'same 404: a public caller must not be able to tell unreleased work from work that ' +
      'never existed. ' +
      CACHE_NOTE,
  })
  @ApiParam({ name: 'slug', description: 'The immutable server-owned product slug.' })
  @ApiExtraModels(
    PublicProductDetailResponse,
    PublicCategoryResponse,
    PublicPriceResponse,
    PublicMediaReferenceResponse,
    PublicProductSeoResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'The published product.',
    schema: envelopeOf(PublicProductDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'The slug is not well formed.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No published product is available at that slug.',
    schema: ERROR_SCHEMA,
  })
  async detail(@Param() params: PublicProductSlugParam): Promise<PublicProductDetailView> {
    return this.guarded(() => this.catalog.detail(params.slug));
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
      throw isPublicProductCatalogError(error) ? toHttpException(error) : error;
    }
  }
}
