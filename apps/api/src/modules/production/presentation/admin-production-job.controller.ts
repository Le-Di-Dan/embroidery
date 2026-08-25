/**
 * The two Admin production reads (`APP8-B03` §7, §8).
 *
 * ```text
 * GET /api/admin/production-jobs          — adminProductionJob_list
 * GET /api/admin/production-jobs/{jobId}  — adminProductionJob_get
 * ```
 *
 * Two, and no third. There is no `POST /production-jobs/{jobId}/start`, no
 * `/complete`, no `/cancel`, no `/artifacts` and no `/notes`: `APP8-B03` §13
 * puts every production **transition** in `APP8-B04`, and `PO-APP8-004` puts
 * artifact management outside APP8 entirely. The absence is structural, not a
 * matter of restraint — this controller resolves no transition use case, and
 * `AdminProductionModule`'s own suite asserts the route count.
 *
 * ### The job is the resource; the order is only a filter
 *
 * A production job has its own id and its own lifecycle, and an operator works
 * a queue across orders — so the collection is addressed directly rather than
 * nested under an order. `?orderId=` narrows it for the case where the operator
 * arrived from one order. **Creation** is the nested route, because a job can
 * only come into existence against an order it is produced for; see
 * `AdminOrderProductionJobController`.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level. No `StaffOriginGuard` and no
 * `StaffJsonBodyGuard`: both are mutation protections, and neither route here
 * mutates anything. No cookie is parsed here and no handler accepts an operator
 * identity.
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { ReadProductionJobDetail } from '../application/admin/read-production-job-detail.query';
import { ReadProductionQueue } from '../application/admin/read-production-queue.query';
import { guardedProductionOperation } from '../domain/production-operations.errors';
import { toDetailPayload, toQueuePayload } from './admin-production-job.payload';
import {
  ListProductionJobsQuery,
  ProductionJobIdParam,
  PRODUCTION_STATUS_FILTERS,
} from './schemas/admin-production-job.request';
import {
  AdminProductionJobDetailResponse,
  AdminProductionJobQueueResponse,
  type AdminProductionJobDetailPayload,
  type AdminProductionJobQueuePayload,
} from './schemas/admin-production-job.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const UNAUTHENTICATED = {
  status: 401,
  description: 'No live Admin session.',
  schema: ERROR_SCHEMA,
} as const;

@ApiTags('adminProductionJob')
@ApiCookieAuth('adminSession')
@Controller('admin/production-jobs')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminProductionJobQueueResponse, AdminProductionJobDetailResponse)
export class AdminProductionJobController {
  constructor(
    private readonly queue: ReadProductionQueue,
    private readonly detail: ReadProductionJobDetail,
  ) {}

  @Get()
  @ApiSuccessCode('PRODUCTION_JOB_QUEUE_READ', 'Production queue read.')
  @ApiOperation({
    summary: 'Read the production work queue',
    description:
      'One keyset page of production jobs, newest first, bounded at 100 rows. With no `status` ' +
      'the page is every LC-18 state: there is no default triage subset, because none is ' +
      'defined by any accepted authority and a silent one would hide the completed and ' +
      'cancelled jobs an operator went looking for. Paging is by opaque cursor on ' +
      '`(createdAt, id)`, so a job created while the operator pages is neither repeated nor ' +
      'skipped. Rows carry the job, the order it belongs to, the exact approval it was frozen ' +
      'from, its state and its lifecycle timestamps — and no priority, SLA, operator, machine ' +
      'or attempt count, because the production model has no such fact.',
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    isArray: true,
    enum: PRODUCTION_STATUS_FILTERS,
    description: 'Repeatable. Absent means every state.',
  })
  @ApiQuery({ name: 'orderId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({
    status: 200,
    description: 'One page of the production queue.',
    schema: envelopeSchemaOf(AdminProductionJobQueueResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed filter, page size, order id, or a cursor this endpoint did not issue.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNAUTHENTICATED)
  async list(@Query() query: ListProductionJobsQuery): Promise<AdminProductionJobQueuePayload> {
    return guardedProductionOperation(async () =>
      toQueuePayload(
        await this.queue.list({
          cursor: query.cursor,
          limit: query.limit,
          statuses: query.status,
          orderId: query.orderId,
        }),
      ),
    );
  }

  @Get(':jobId')
  @ApiSuccessCode('PRODUCTION_JOB_READ', 'Production job read.')
  @ApiOperation({
    summary: 'Read one production job, its frozen specification and its history',
    description:
      'The job root with its LC-18 evidence, the immutable specification frozen from the exact ' +
      'approval snapshot at creation, the append-only transition history in insert order, and ' +
      'read-only inventory context. The specification is a copy, never a live read: a product ' +
      'renamed in the catalog after the job was created does not change what is produced. The ' +
      'reservation summary is display context only — a customer-owned-only order truthfully ' +
      'reports no reservation requirement, and a Catalog order reports the reservations ' +
      'standing against it. It is taken without the stock row lock and is never the basis of a ' +
      'production-start decision. No artifact, note, customer detail or amount is returned.',
  })
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'That production job.',
    schema: envelopeSchemaOf(AdminProductionJobDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed job id.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({ status: 404, description: 'No such production job.', schema: ERROR_SCHEMA })
  async get(@Param() params: ProductionJobIdParam): Promise<AdminProductionJobDetailPayload> {
    return guardedProductionOperation(async () =>
      toDetailPayload(await this.detail.read(params.jobId)),
    );
  }
}
