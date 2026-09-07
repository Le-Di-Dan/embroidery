/**
 * The one bounded Admin Product media-curation operation (`APP12-M01.B2`).
 *
 *   PUT /api/admin/products/:productId/media — adminProductMedia_replace
 *
 * A separate controller from `AdminProductController` on purpose, and the split
 * is the contract rather than a file-layout choice: that class is the `APP2-B02`
 * **draft** surface, locked to `DRAFT` by `PRODUCT_EDITABLE_STATES`, and this
 * one is the only route in the repository allowed to write anything about a
 * `PUBLISHED` Product short of a lifecycle transition. Keeping them apart is
 * what makes "the published Product is not editable" reviewable — the exception
 * is one file, one route and one body, not a state list widened somewhere
 * inside a shared handler.
 *
 * `PUT` rather than `PATCH`: the body carries the complete intended selection,
 * so the request is idempotent and replaying it is safe.
 *
 * The controller owns the HTTP contract and nothing else. Ordering, primary
 * assignment, the cap, duplicate refusal, published viability, concurrency and
 * atomicity all live behind `ReplaceProductMediaUseCase`.
 */
import { Body, Controller, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
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
import { ReplaceProductMediaUseCase } from '../application/replace-product-media.use-case';
import type { ProductDetailView } from '../application/product-projection';
import { isProductDraftError, toHttpException } from '../domain/product-draft.errors';
import { AdminProductDetailResponse } from './schemas/admin-product.response';
import { ProductIdParam } from './schemas/admin-product.request';
import { ReplaceProductMediaBody } from './schemas/admin-product-media.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminProductMedia')
@ApiCookieAuth('adminSession')
@Controller('admin/products')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductMediaController {
  constructor(private readonly replaceMedia: ReplaceProductMediaUseCase) {}

  @Put(':productId/media')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PRODUCT_MEDIA_REPLACED', 'Product images updated.')
  @ApiOperation({
    summary: 'Replace a product image selection',
    description:
      'Replaces the whole ordered image selection of a DRAFT or PUBLISHED product, and ' +
      'changes nothing else about it. The array is the entire write model: the first id ' +
      'becomes the primary image, array order becomes display order, and an id left out is ' +
      'removed. There is no separate add, remove, reorder or set-primary operation. A ' +
      'DRAFT may hold none; a PUBLISHED product must keep at least one, and every image in ' +
      'the requested set must still satisfy the publication image rules — otherwise the ' +
      'request is refused whole and the product keeps its previous images, its published ' +
      'status and every commercial field. Requires `expectedUpdatedAt`; a stale value is a ' +
      'conflict rather than an overwrite. Generic product fields stay locked while published.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: ReplaceProductMediaBody })
  @ApiExtraModels(AdminProductDetailResponse)
  @ApiResponse({
    status: 200,
    description: 'The product, with its new ordered image selection.',
    schema: {
      allOf: [
        { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
        {
          type: 'object',
          required: ['data'],
          properties: { data: { $ref: getSchemaPath(AdminProductDetailResponse) } },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, too many images, a repeated image, or an unknown image.',
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
      'Stale `expectedUpdatedAt`, a state that cannot be curated, an image that is not ' +
      'ready, or a selection a published product cannot carry.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async replace(
    @Param() params: ProductIdParam,
    @Body() body: ReplaceProductMediaBody,
  ): Promise<ProductDetailView> {
    try {
      return await this.replaceMedia.execute({
        productId: params.productId,
        mediaAssetIds: body.mediaAssetIds,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error: unknown) {
      throw isProductDraftError(error) ? toHttpException(error) : error;
    }
  }
}
