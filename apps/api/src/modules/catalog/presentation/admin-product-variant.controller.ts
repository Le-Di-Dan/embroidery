/**
 * The three Admin variant operations (`APP12-N02.B01`).
 *
 *   GET   /api/admin/products/:productId/variants            — adminProductVariant_list
 *   POST  /api/admin/products/:productId/variants            — adminProductVariant_create
 *   PATCH /api/admin/products/:productId/variants/:variantId — adminProductVariant_update
 *
 * A controller of its own rather than three more methods on
 * `AdminProductController`, for the reason `AdminProductPublicationController`
 * already gives: that file is near its limit and variant authoring is a
 * distinct responsibility. The three operation ids are **derived** from the
 * class and method names by the canonical policy rather than stated on each
 * `@ApiOperation`, so this class owes no `CONTROLLER_DOMAIN_KEYS` entry and no
 * public identifier is written down twice.
 *
 * There is no DELETE, and its absence is part of the contract: a variant leaves
 * the catalog through `isActive`, which keeps the commercial history that
 * references it readable (`N02.D01` §E).
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `ProductVariantError` into the
 * canonical exception. Every rule about labels, identity, lifecycle state and
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
import { ProductVariantService } from '../application/product-variant.service';
import type {
  AdminProductVariantListView,
  AdminProductVariantView,
} from '../application/product-variant.projection';
import { isProductVariantError, toHttpException } from '../domain/product-variant.errors';
import {
  AdminProductVariantListResponse,
  AdminProductVariantResponse,
  AdminVariantSkuResponse,
} from './schemas/admin-product-variant.response';
import {
  CreateProductVariantBody,
  ProductVariantParams,
  ProductVariantsParams,
  UpdateProductVariantBody,
} from './schemas/admin-product-variant.request';

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

const LABEL_RULE =
  'At least one of `colorName` and `sizeLabel` must be non-blank once trimmed. Both labels ' +
  'are trimmed and their internal whitespace collapsed before they are stored and compared, ' +
  'and a blank label is stored as null. Within one product the normalized pair must be ' +
  'unique, compared case-insensitively and without stripping accents, across active and ' +
  'inactive variants alike.';

@ApiTags('adminProductVariant')
@ApiCookieAuth('adminSession')
@Controller('admin/products')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductVariantController {
  constructor(private readonly variants: ProductVariantService) {}

  @Get(':productId/variants')
  @ApiSuccessCode('PRODUCT_VARIANTS_READ', 'Product variants read.')
  @ApiOperation({
    summary: 'List the variants and SKUs of a product',
    description:
      'The authoring and history source for the sellability section. Returns every variant ' +
      'of the product and every SKU under it — inactive rows included — in a stable order, ' +
      'for any lifecycle state. Read-only: it writes nothing and records no audit event. ' +
      'The public variant projection is not a substitute: it is keyed by slug, refuses ' +
      'anything but a published product, filters out inactive variants and SKUs, and ' +
      'publishes neither the SKU code nor the sellable flag.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiExtraModels(
    AdminProductVariantListResponse,
    AdminProductVariantResponse,
    AdminVariantSkuResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'The variants of the product, each with its SKUs.',
    schema: envelopeOf(AdminProductVariantListResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  async list(@Param() params: ProductVariantsParams): Promise<AdminProductVariantListView> {
    return this.guarded(() => this.variants.list(params.productId));
  }

  @Post(':productId/variants')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('PRODUCT_VARIANT_CREATED', 'Product variant created.')
  @ApiOperation({
    summary: 'Create a product variant',
    description:
      'Creates one variant of the product. Allowed while the product is a draft and while it ' +
      'is published — a live product must be repairable in place, and creating a variant ' +
      'never unpublishes it — and refused once it is archived. The display order is assigned ' +
      'by the server under a write lock and is never accepted from the request; there is no ' +
      'reorder operation. ' +
      LABEL_RULE,
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: CreateProductVariantBody })
  @ApiExtraModels(AdminProductVariantResponse, AdminVariantSkuResponse)
  @ApiResponse({
    status: 201,
    description: 'The created variant.',
    schema: envelopeOf(AdminProductVariantResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body or path parameter, or neither label is non-blank.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The product state does not allow variant changes, or the product already has a variant with that colour and size.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async create(
    @Param() params: ProductVariantsParams,
    @Body() body: CreateProductVariantBody,
  ): Promise<AdminProductVariantView> {
    return this.guarded(() =>
      this.variants.create({
        productId: params.productId,
        colorName: body.colorName,
        sizeLabel: body.sizeLabel,
        isActive: body.isActive,
      }),
    );
  }

  @Patch(':productId/variants/:variantId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('PRODUCT_VARIANT_UPDATED', 'Product variant updated.')
  @ApiOperation({
    summary: 'Update, deactivate or reactivate a product variant',
    description:
      'Patches the two labels and the offered flag. A label may be cleared with null or a ' +
      'blank string as long as the other one survives. Deactivating is how a variant leaves ' +
      'the catalog — there is no delete, and deactivating the last active variant of a ' +
      'published product does not unpublish it. Allowed on a draft and on a published ' +
      'product, refused once archived. The variant must belong to the addressed product; ' +
      'one that belongs to another is reported as not found under this one. ' +
      LABEL_RULE,
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiBody({ type: UpdateProductVariantBody })
  @ApiExtraModels(AdminProductVariantResponse, AdminVariantSkuResponse)
  @ApiResponse({
    status: 200,
    description: 'The updated variant.',
    schema: envelopeOf(AdminProductVariantResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid body or path parameter, no field named, or the patch would leave the variant with neither label.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'No such product, no such variant, or the variant belongs to another product.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'The product state does not allow variant changes, or another variant of the product already has that colour and size.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async update(
    @Param() params: ProductVariantParams,
    @Body() body: UpdateProductVariantBody,
  ): Promise<AdminProductVariantView> {
    return this.guarded(() =>
      this.variants.update({
        productId: params.productId,
        variantId: params.variantId,
        // Spread conditionally rather than passed through: the service tells a
        // field that was named and set to null from one that was not named at
        // all, and `{ colorName: undefined }` would erase that distinction.
        fields: {
          ...(body.colorName === undefined ? {} : { colorName: body.colorName }),
          ...(body.sizeLabel === undefined ? {} : { sizeLabel: body.sizeLabel }),
          ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
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
      throw isProductVariantError(error) ? toHttpException(error) : error;
    }
  }
}
