/**
 * The five Admin product-draft operations (`APP2-B02`).
 *
 *   GET   /api/admin/products              — adminProduct_list
 *   GET   /api/admin/products/:productId   — adminProduct_detail
 *   POST  /api/admin/products              — adminProduct_create
 *   PATCH /api/admin/products/:productId   — adminProduct_update
 *   POST  /api/admin/products/:productId/archive — adminProduct_archive
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `ProductDraftError` into the
 * canonical exception. Every rule about lifecycle, slugs, media ordering and
 * concurrency lives behind the service boundary.
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
import { ProductDraftQuery } from '../application/product-draft.query';
import { ProductDraftService } from '../application/product-draft.service';
import type { ProductDetailView, ProductListView } from '../application/product-projection';
import { isProductDraftError, toHttpException } from '../domain/product-draft.errors';
import { APP2_CATEGORY_SLUGS } from '../domain/product-draft.policy';
import {
  AdminProductDetailResponse,
  AdminProductListResponse,
} from './schemas/admin-product.response';
import {
  ArchiveProductBody,
  CreateProductBody,
  ListProductsQuery,
  ProductIdParam,
  UpdateProductBody,
} from './schemas/admin-product.request';

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

@ApiTags('adminProduct')
@ApiCookieAuth('adminSession')
@Controller('admin/products')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductController {
  constructor(
    private readonly drafts: ProductDraftService,
    private readonly query: ProductDraftQuery,
  ) {}

  @Get()
  @ApiSuccessCode('PRODUCT_LIST_READ', 'Products retrieved.')
  @ApiOperation({
    summary: 'List Admin products',
    description:
      'Keyset-paginated, newest first. There is no offset paging and no total count. ' +
      'With no status filter the page carries drafts, published and archived products alike.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @ApiQuery({ name: 'categorySlug', required: false, enum: APP2_CATEGORY_SLUGS })
  @ApiExtraModels(AdminProductListResponse)
  @ApiResponse({
    status: 200,
    description: 'One page of products.',
    schema: envelopeOf(AdminProductListResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  async list(@Query() query: ListProductsQuery): Promise<ProductListView> {
    return this.guarded(() => this.query.list(query));
  }

  @Get(':productId')
  @ApiSuccessCode('PRODUCT_DETAIL_READ', 'Product retrieved.')
  @ApiOperation({
    summary: 'Get one Admin product',
    description:
      'Returns the editable draft fields, the ordered media selection and the ' +
      '`updatedAt` concurrency token.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiExtraModels(AdminProductDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The product.',
    schema: envelopeOf(AdminProductDetailResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  async detail(@Param() params: ProductIdParam): Promise<ProductDetailView> {
    return this.guarded(() => this.query.detail(params.productId));
  }

  @Post()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('PRODUCT_DRAFT_CREATED', 'Product draft created.')
  @ApiOperation({
    summary: 'Create a product draft',
    description:
      'Creates a DRAFT in the chosen category. The slug is derived from the name by the ' +
      'server and is immutable; price and display order start at their draft sentinels, and ' +
      'the draft has no media until a later update.',
  })
  @ApiBody({ type: CreateProductBody })
  @ApiExtraModels(AdminProductDetailResponse)
  @ApiResponse({
    status: 201,
    description: 'The created draft.',
    schema: envelopeOf(AdminProductDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body or category.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'No product address could be reserved.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async create(@Body() body: CreateProductBody): Promise<ProductDetailView> {
    return this.guarded(() =>
      this.drafts.create({
        categorySlug: body.categorySlug,
        name: body.name,
        // Absent or blank both mean "no description"; the column keeps NULL.
        description:
          body.description === undefined || body.description.trim() === ''
            ? undefined
            : body.description,
      }),
    );
  }

  @Patch(':productId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('PRODUCT_DRAFT_UPDATED', 'Product draft updated.')
  @ApiOperation({
    summary: 'Update a product draft',
    description:
      'Patches editable DRAFT fields and, when `mediaAssetIds` is present, replaces the whole ' +
      'ordered media selection. Requires `expectedUpdatedAt`; a stale value is rejected as a ' +
      'conflict rather than overwriting a concurrent change. Renaming never changes the slug.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: UpdateProductBody })
  @ApiExtraModels(AdminProductDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The updated draft.',
    schema: envelopeOf(AdminProductDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, category or media.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'Stale `expectedUpdatedAt`, a non-editable state, or an unusable image.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async update(
    @Param() params: ProductIdParam,
    @Body() body: UpdateProductBody,
  ): Promise<ProductDetailView> {
    return this.guarded(() =>
      this.drafts.update({
        productId: params.productId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
        ...(body.name === undefined ? {} : { name: body.name }),
        // Description contract (APP2-B02-C1 §9), stated once here:
        //   absent            -> leave the stored value unchanged
        //   null or blank     -> clear it to NULL
        //   any other text    -> store it
        ...(body.description === undefined
          ? {}
          : {
              description:
                body.description === null || body.description.trim() === ''
                  ? null
                  : body.description,
            }),
        ...(body.basePriceAmount === undefined ? {} : { basePriceAmount: body.basePriceAmount }),
        ...(body.categorySlug === undefined ? {} : { categorySlug: body.categorySlug }),
        ...(body.mediaAssetIds === undefined ? {} : { mediaAssetIds: body.mediaAssetIds }),
      }),
    );
  }

  @Post(':productId/archive')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PRODUCT_ARCHIVED', 'Product archived.')
  @ApiOperation({
    summary: 'Archive a product',
    description:
      'Moves a DRAFT to ARCHIVED. This is not a delete: the product, its media links, the ' +
      'referenced images and their derivatives all remain. Publication is not touched.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: ArchiveProductBody })
  @ApiExtraModels(AdminProductDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The archived product.',
    schema: envelopeOf(AdminProductDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'Stale `expectedUpdatedAt` or a state that cannot be archived.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async archive(
    @Param() params: ProductIdParam,
    @Body() body: ArchiveProductBody,
  ): Promise<ProductDetailView> {
    return this.guarded(() =>
      this.drafts.archive({
        productId: params.productId,
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
      throw isProductDraftError(error) ? toHttpException(error) : error;
    }
  }
}
