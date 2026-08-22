/**
 * The two Admin SKU-authoring operations (`APP7-B01`).
 *
 *   POST  /api/admin/products/:productId/variants/:variantId/skus — adminSku_create
 *   PATCH /api/admin/skus/:skuId                                  — adminSku_update
 *
 * One class for two bases. The create is addressed through its owning variant,
 * because that is the parent a new SKU is created under; the update is addressed
 * by the SKU itself, because its owning variant is immutable and must be
 * resolved server-side rather than restated by a caller. A base path of `admin`
 * with the rest on each handler keeps both under one published domain —
 * `adminSku_create` and `adminSku_update` — without letting a file-layout
 * decision name a public identifier. Neither route can shadow another: they
 * differ from every registered Admin route in segment count and in their first
 * segment after `admin`.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `ProductSkuError` into the
 * canonical exception. Every rule about hierarchy, order-eligibility and
 * concurrency lives behind the service boundary.
 */
import {
  Body,
  Controller,
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
import { ProductSkuService } from '../application/product-sku.service';
import type { AdminSkuView } from '../application/product-sku.projection';
import { isProductSkuError, toHttpException } from '../domain/product-sku.errors';
import { AdminSkuResponse } from './schemas/admin-sku.response';
import {
  CreateSkuBody,
  CreateSkuParams,
  SkuIdParam,
  UpdateSkuBody,
} from './schemas/admin-sku.request';

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

@ApiTags('adminSku')
@ApiCookieAuth('adminSession')
@Controller('admin')
@UseGuards(AuthenticatedAdminGuard)
export class AdminSkuController {
  constructor(private readonly skus: ProductSkuService) {}

  @Post('products/:productId/variants/:variantId/skus')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('SKU_CREATED', 'SKU created.')
  @ApiOperation({
    summary: 'Create a SKU for a product variant',
    description:
      'Creates one sellable SKU definition under the named variant. The product/variant ' +
      'relationship is proved server-side from locked rows, and the write is refused when it ' +
      'would leave the variant with more than one order-eligible (`isActive`) SKU — an order ' +
      'must be able to resolve exactly one SKU without guessing. The currency is server-owned ' +
      '(VND) and stock is not part of this contract: `skus` is the definition side only.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiBody({ type: CreateSkuBody })
  @ApiExtraModels(AdminSkuResponse)
  @ApiResponse({
    status: 201,
    description: 'The created SKU.',
    schema: envelopeOf(AdminSkuResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body or path parameter.',
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
      'The SKU code is already in use, the product state does not allow SKU changes, or the write would leave more than one order-eligible SKU on the variant.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async create(
    @Param() params: CreateSkuParams,
    @Body() body: CreateSkuBody,
  ): Promise<AdminSkuView> {
    return this.guarded(() =>
      this.skus.create({
        productId: params.productId,
        variantId: params.variantId,
        code: body.code,
        ...(body.priceOverrideAmount === undefined
          ? {}
          : { priceOverrideAmount: body.priceOverrideAmount }),
        isActive: body.isActive,
      }),
    );
  }

  @Patch('skus/:skuId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('SKU_UPDATED', 'SKU updated.')
  @ApiOperation({
    summary: 'Update a SKU',
    description:
      'Patches the code, the optional price override and the sellable flag. The owning variant ' +
      'is resolved server-side and cannot be changed — there is no field that moves a SKU to ' +
      'another variant. Activating a SKU is refused when its variant already has an ' +
      'order-eligible one; deactivating is always allowed. Sending `priceOverrideAmount: null` ' +
      'clears the override so the product base price applies again.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiBody({ type: UpdateSkuBody })
  @ApiExtraModels(AdminSkuResponse)
  @ApiResponse({
    status: 200,
    description: 'The updated SKU.',
    schema: envelopeOf(AdminSkuResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body or path parameter.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such SKU.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The SKU code is already in use, the product state does not allow SKU changes, or the write would leave more than one order-eligible SKU on the variant.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async update(@Param() params: SkuIdParam, @Body() body: UpdateSkuBody): Promise<AdminSkuView> {
    return this.guarded(() =>
      this.skus.update({
        skuId: params.skuId,
        fields: {
          ...(body.code === undefined ? {} : { code: body.code }),
          ...(body.priceOverrideAmount === undefined
            ? {}
            : { priceOverrideAmount: body.priceOverrideAmount }),
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
      throw isProductSkuError(error) ? toHttpException(error) : error;
    }
  }
}
