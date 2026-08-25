/**
 * The one Admin production mutation (`APP8-B03` §3, §5).
 *
 * ```text
 * POST /api/admin/orders/{orderId}/production-jobs — adminProductionJob_create
 * ```
 *
 * One, and no second. There is no start, complete or cancel route anywhere in
 * this module: `APP8-B03` §13 puts every LC-18 transition in `APP8-B04`.
 *
 * ### Why the job is created under the order
 *
 * A production job cannot exist without the order it is produced for, and the
 * approval it freezes is resolved **from that order's row**
 * (`orders.current_approval_snapshot_id`, §5.3). Putting the order in the path
 * rather than in the body is what makes that resolution the only reading of the
 * request: there is no shape in which an operator names an order in one field
 * and an unrelated approval in another and gets a job out of it. The optional
 * `approvalSnapshotId` in the body is a confirmation of what the order already
 * says, and a mismatch is refused (`PRODUCTION_APPROVAL_MISMATCH`).
 *
 * `APP7-B02`'s `AdminOrderController` and `APP7-B04`'s Admin payment surface
 * already publish routes under `admin/orders`, so this base path is shared
 * rather than new. That is safe: this route adds a `production-jobs` segment, so
 * Nest matches on segment count and method and no registration order can make
 * one shadow another. They remain separate modules because an order read holds
 * the queue projection and a payment route holds the money writers, and a
 * production creation must be able to reach neither.
 *
 * ### 201, and what the receipt says
 *
 * A resource is created and is addressable afterwards at
 * `GET /api/admin/production-jobs/{jobId}`, so this is the one Admin operation
 * in APP8 that answers `201`. The receipt is the job root — id, order, the
 * resolved approval, and `PLANNED`. It deliberately does not echo the frozen
 * specification: the operator reads that from the detail route, from
 * `production_specifications`, rather than from a copy this handler assembled.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, plus `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on the mutation — the exact combination every Admin
 * mutation in this repository already uses. No handler accepts an operator
 * identity: the actor is bound by the guard and asserted inside the use case.
 */
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { CreateProductionJobUseCase } from '../application/admin/create-production-job.use-case';
import { guardedProductionOperation } from '../domain/production-operations.errors';
import {
  CreateProductionJobBody,
  ProductionOrderIdParam,
} from './schemas/admin-production-job.request';
import {
  AdminProductionJobCreatedResponse,
  type AdminProductionJobCreatedPayload,
} from './schemas/admin-production-job.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminProductionJob')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminProductionJobCreatedResponse)
export class AdminOrderProductionJobController {
  constructor(private readonly jobs: CreateProductionJobUseCase) {}

  @Post(':orderId/production-jobs')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('PRODUCTION_JOB_CREATED', 'Production job created.')
  @ApiOperation({
    summary: 'Create the production job for one order',
    description:
      'Creates a PLANNED production job against the exact approval snapshot the order names, ' +
      'freezing its specification from that approval in the same transaction. The approval is ' +
      'read from the order, never chosen by the caller: a snapshot approved for a different ' +
      'order cannot become this order’s production basis, and naming one is refused. ' +
      'Creation requires the order’s deposit obligation to be SATISFIED (GRD-013), checked ' +
      'through the single deposit authority — an unsatisfied deposit creates no job and no ' +
      'specification at all. One job exists per (order, approval snapshot); a repeat request ' +
      'is refused and never produces a second job. An inventory reservation is **not** ' +
      'required to plan the work: a customer-owned-only order has none by design, and whether ' +
      'production may actually start is a later, separate decision. This operation starts no ' +
      'production, moves no order and touches no reservation.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: CreateProductionJobBody })
  @ApiResponse({
    status: 201,
    description: 'The created job, in PLANNED.',
    schema: envelopeSchemaOf(AdminProductionJobCreatedResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed order id or body.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such order.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The named approval does not belong to this order, the deposit is not satisfied, or a ' +
      'job already exists for this order and approval. Nothing was created.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async create(
    @Param() params: ProductionOrderIdParam,
    @Body() body: CreateProductionJobBody,
  ): Promise<AdminProductionJobCreatedPayload> {
    return guardedProductionOperation(async () => {
      const job = await this.jobs.create({
        orderId: params.orderId,
        approvalSnapshotId: body.approvalSnapshotId,
        productionParameters: body.productionParameters,
      });
      return {
        jobId: job.id,
        orderId: job.orderId,
        approvalSnapshotId: job.approvalSnapshotId,
        status: job.status,
      };
    });
  }
}
