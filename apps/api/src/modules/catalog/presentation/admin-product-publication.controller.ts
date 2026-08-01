/**
 * The three Admin product publication operations (`APP2-B03`).
 *
 *   GET  /api/admin/products/:productId/publication-readiness
 *          — adminProduct_publicationReadiness
 *   POST /api/admin/products/:productId/publish     — adminProduct_publish
 *   POST /api/admin/products/:productId/unpublish   — adminProduct_unpublish
 *
 * A controller of its own rather than three more methods on
 * `AdminProductController`: that file is already at 310 of its 400-line limit,
 * and publication is a distinct responsibility from draft management. The
 * operation ids are stated explicitly on each `@ApiOperation` so they stay in
 * the `adminProduct_*` family the client already exposes — the default factory
 * derives them from the controller class name, which would otherwise fork the
 * public contract just because the implementation was split across two files.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `ProductDraftError` into the
 * canonical exception. Every lifecycle, readiness and concurrency rule lives
 * behind the service boundary.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ProductPublicationService } from '../application/product-publication.service';
import type {
  ProductPublicationReadinessView,
  ProductPublicationView,
} from '../application/product-publication.projection';
import { isProductDraftError, toHttpException } from '../domain/product-draft.errors';
import {
  AdminProductPublicationReadinessResponse,
  AdminProductPublicationResponse,
  AdminProductRequirementResponse,
} from './schemas/admin-product-publication.response';
import {
  PublishProductBody,
  UnpublishProductBody,
} from './schemas/admin-product-publication.request';
import { ProductIdParam } from './schemas/admin-product.request';

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

const TOKEN_DESCRIPTION =
  'Requires `expectedUpdatedAt`, the `updatedAt` token last read for this product. ' +
  'A stale value is rejected as `PRODUCT_VERSION_CONFLICT` rather than overwriting a ' +
  'concurrent change, and a successful write advances the token.';

@ApiTags('adminProduct')
@ApiCookieAuth('adminSession')
@Controller('admin/products')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductPublicationController {
  constructor(private readonly publication: ProductPublicationService) {}

  @Get(':productId/publication-readiness')
  @ApiSuccessCode('PRODUCT_PUBLICATION_READINESS_READ', 'Publication readiness evaluated.')
  @ApiOperation({
    operationId: 'adminProduct_publicationReadiness',
    summary: 'Evaluate product publication readiness',
    description:
      'Reports the complete, closed requirement set in a stable order, whether each is ' +
      'satisfied, and the current lifecycle status and concurrency token. Read-only: it ' +
      'writes nothing, records no audit or event, and makes no storage call. The result is ' +
      'a report about this moment — publish re-evaluates every requirement inside its own ' +
      'transaction and may still refuse.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiExtraModels(AdminProductPublicationReadinessResponse, AdminProductRequirementResponse)
  @ApiResponse({
    status: 200,
    description: 'The readiness report.',
    schema: envelopeOf(AdminProductPublicationReadinessResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  async publicationReadiness(
    @Param() params: ProductIdParam,
  ): Promise<ProductPublicationReadinessView> {
    return this.guarded(() => this.publication.readiness(params.productId));
  }

  @Post(':productId/publish')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PRODUCT_PUBLISHED', 'Product published.')
  @ApiOperation({
    operationId: 'adminProduct_publish',
    summary: 'Publish a product',
    description:
      'Moves a DRAFT to PUBLISHED (`TR-LC04-01`). Every publication requirement is ' +
      're-evaluated inside the transaction against locked rows, so a readiness check that ' +
      'passed a moment ago is never trusted. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: PublishProductBody })
  @ApiExtraModels(AdminProductPublicationResponse)
  @ApiResponse({
    status: 200,
    description: 'The published product.',
    schema: envelopeOf(AdminProductPublicationResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
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
      'Stale `expectedUpdatedAt` (`PRODUCT_VERSION_CONFLICT`), a state that cannot be ' +
      'published (`PRODUCT_PUBLISH_NOT_ALLOWED`), or unmet requirements ' +
      '(`PRODUCT_PUBLICATION_NOT_READY`, whose `errors[].code` lists the unsatisfied codes).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async publish(
    @Param() params: ProductIdParam,
    @Body() body: PublishProductBody,
  ): Promise<ProductPublicationView> {
    return this.guarded(() =>
      this.publication.publish({
        productId: params.productId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      }),
    );
  }

  @Post(':productId/unpublish')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PRODUCT_UNPUBLISHED', 'Product unpublished.')
  @ApiOperation({
    operationId: 'adminProduct_unpublish',
    summary: 'Unpublish a product',
    description:
      'Moves a PUBLISHED product back to DRAFT (`TR-LC04-05`), removing public visibility ' +
      'by lifecycle state alone. This is not archive and not a delete: the slug, category, ' +
      'price, media links, images and their derivatives all remain, `archivedAt` is never ' +
      'written, and the product becomes editable again. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: UnpublishProductBody })
  @ApiExtraModels(AdminProductPublicationResponse)
  @ApiResponse({
    status: 200,
    description: 'The unpublished product.',
    schema: envelopeOf(AdminProductPublicationResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
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
      'Stale `expectedUpdatedAt` (`PRODUCT_VERSION_CONFLICT`) or a state that cannot be ' +
      'unpublished (`PRODUCT_UNPUBLISH_NOT_ALLOWED`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async unpublish(
    @Param() params: ProductIdParam,
    @Body() body: UnpublishProductBody,
  ): Promise<ProductPublicationView> {
    return this.guarded(() =>
      this.publication.unpublish({
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
