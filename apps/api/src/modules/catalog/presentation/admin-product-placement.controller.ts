/**
 * The two Admin placement operations (`APP3-B01`).
 *
 *   GET /api/admin/products/:productId/placement — adminProductPlacement_get
 *   PUT /api/admin/products/:productId/placement — adminProductPlacement_replace
 *
 * The operation ids are derived, not declared: `createOperationId` builds
 * `<controller minus Controller, lower-cased>_<method>`, so the class name and
 * the two method names below are the contract the generated client is built
 * from.
 *
 * The controller owns the HTTP contract and nothing else — guards, status codes,
 * documentation, and turning a transport-free `ProductPlacementError` into the
 * canonical exception. Every rule about geometry, identity, retirement and
 * concurrency lives behind the service boundary.
 */
import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
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
import { ProductPlacementQuery } from '../application/product-placement.query';
import { ProductPlacementService } from '../application/product-placement.service';
import type { AdminPlacementView } from '../application/product-placement.projection';
import { isProductPlacementError, toHttpException } from '../domain/product-placement.errors';
import { AdminProductPlacementResponse } from './schemas/product-placement.response';
import {
  ProductPlacementIdParam,
  ReplaceProductPlacementBody,
} from './schemas/admin-product-placement.request';

function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminProductPlacement')
@ApiCookieAuth('adminSession')
@Controller('admin/products/:productId/placement')
@UseGuards(AuthenticatedAdminGuard)
export class AdminProductPlacementController {
  constructor(
    private readonly query: ProductPlacementQuery,
    private readonly placement: ProductPlacementService,
  ) {}

  @Get()
  @ApiSuccessCode('PRODUCT_PLACEMENT_READ', 'Product placement retrieved.')
  @ApiOperation({
    summary: 'Get the Product placement authoring model',
    description:
      'Returns every Product Side and Embroidery Area of the product, **including retired ones**, ' +
      'ordered by displayOrder, code and id. Retired rows are what an existing Template or Design ' +
      'Session references, so an operator who could not see them would not understand why a code ' +
      'is unavailable. `updatedAt` is the concurrency token a replace must echo back.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiExtraModels(AdminProductPlacementResponse)
  @ApiResponse({
    status: 200,
    description: 'The placement authoring model.',
    schema: envelopeOf(AdminProductPlacementResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  async get(@Param() params: ProductPlacementIdParam): Promise<AdminPlacementView> {
    return this.guarded(() => this.query.adminRead(params.productId));
  }

  @Put()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('PRODUCT_PLACEMENT_REPLACED', 'Product placement replaced.')
  @ApiOperation({
    summary: 'Replace the Product placement model',
    description:
      'Replaces the whole placement model atomically. A side or area carrying an `id` is retained ' +
      'and updated; one without an `id` is created; one that is omitted is **retired**, never ' +
      'deleted. A new row may name the row it replaces through `supersedesId`, within the same ' +
      'parent only. Once a side or area is referenced by a Template or a live Design Session its ' +
      'identity and geometry can no longer change — display copy and ordering still can. ' +
      'Requires `expectedUpdatedAt`; a stale value is rejected rather than overwriting a ' +
      'concurrent change. An empty `sides` list retires the entire placement.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: ReplaceProductPlacementBody })
  @ApiExtraModels(AdminProductPlacementResponse)
  @ApiResponse({
    status: 200,
    description: 'The replaced placement model.',
    schema: envelopeOf(AdminProductPlacementResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid geometry, a duplicate code, a row addressed from the wrong parent, an ' +
      'unusable background or an invalid replacement.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such product.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'Stale `expectedUpdatedAt`, a background that is not usable, or a referenced ' +
      'placement whose identity or geometry may no longer change.',
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
  async replace(
    @Param() params: ProductPlacementIdParam,
    @Body() body: ReplaceProductPlacementBody,
  ): Promise<AdminPlacementView> {
    return this.guarded(() =>
      this.placement.replace({
        productId: params.productId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
        sides: body.sides,
      }),
    );
  }

  /**
   * The single translation point from the feature's transport-free error to the
   * canonical HTTP exception. Anything else propagates untouched and is
   * sanitised by the platform filter, which is the correct treatment for an
   * unreviewed failure.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      throw isProductPlacementError(error) ? toHttpException(error) : error;
    }
  }
}
