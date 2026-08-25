/**
 * The one Admin production transition route (`APP8-B04` §3).
 *
 * ```text
 * POST /api/admin/production-jobs/{jobId}/transitions — adminProductionJob_transition
 * ```
 *
 * **One endpoint, not three.** Start, complete and cancel are the same command
 * against the same aggregate under the same guards, differing in the target
 * state and in what that state implies. Three routes would publish three
 * operation ids and three request contracts for one state machine, and a client
 * would have to know which verb LC-18 permits before it could ask — which is the
 * server's job. The target is a typed field, so an illegal move is one
 * `PRODUCTION_INVALID_TRANSITION`, not a `404` on a route that happens not to
 * exist for that state.
 *
 * `transitions` is a collection because each accepted command appends a row to
 * `production_job_transitions`: the request creates a transition. The receipt is
 * `200`, not `201` — the appended row has no id of its own and is addressable
 * only as part of the job's history on `GET /api/admin/production-jobs/{jobId}`.
 *
 * ### There is still no customer or public production route
 *
 * `CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8`. Nothing here is reachable
 * without an Admin session, and the contract suite asserts the whole document
 * publishes no public production path.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on the mutation — the exact combination every Admin
 * mutation in this repository uses. No handler accepts an operator identity: the
 * actor is bound by the guard and read from the request context inside the use
 * case, never from the body.
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
import { TransitionProductionJobUseCase } from '../application/admin/transition-production-job.use-case';
import { guardedProductionOperation } from '../domain/production-operations.errors';
import { ProductionJobIdParam } from './schemas/admin-production-job.request';
import { TransitionProductionJobBody } from './schemas/admin-production-transition.request';
import {
  AdminProductionTransitionResultResponse,
  type AdminProductionTransitionResultPayload,
} from './schemas/admin-production-transition.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminProductionJob')
@ApiCookieAuth('adminSession')
@Controller('admin/production-jobs')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminProductionTransitionResultResponse)
export class AdminProductionTransitionController {
  constructor(private readonly jobs: TransitionProductionJobUseCase) {}

  @Post(':jobId/transitions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PRODUCTION_JOB_TRANSITIONED', 'Production job transitioned.')
  @ApiOperation({
    summary: 'Start, complete or cancel one production job',
    description:
      'Moves the job through LC-18 and, where the lifecycle requires it, the order and the ' +
      "order's inventory reservations — all in one transaction that commits together or not " +
      'at all.\n\n' +
      '**STARTED** requires the job PLANNED, the order DEPOSIT_PAID and not on hold or being ' +
      'cancelled, the order’s DEPOSIT obligation satisfied, and the job frozen from the ' +
      'approval the order is still produced against. It consumes every Catalog reservation ' +
      'the order’s frozen items require — one per SKU, quantity aggregated — decrementing ' +
      'on-hand once each, and moves the order to IN_PRODUCTION. A customer-owned-only order ' +
      'requires no reservation at all and starts with none; a mixed order consumes only its ' +
      'Catalog portions. If any required reservation is missing, already terminal or short, ' +
      'nothing at all is committed — including reservations earlier in the same request.\n\n' +
      '**COMPLETED** requires the job STARTED and the order IN_PRODUCTION, and moves the ' +
      'order to PRODUCTION_COMPLETED. It touches no inventory: the goods were issued at ' +
      'start. It does not request the remaining payment, freeze shipping or dispatch.\n\n' +
      '**CANCELLED** requires a reason, is legal from PLANNED or STARTED, and releases only ' +
      'reservations that are still reserved. A job cancelled after production started leaves ' +
      'its consumed inventory consumed — stock that has left is not restored by cancelling ' +
      'the paperwork. The order’s own commercial state is deliberately unchanged: cancelling ' +
      'a production job is not the order cancellation and refund workflow.',
  })
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiBody({ type: TransitionProductionJobBody })
  @ApiResponse({
    status: 200,
    description: 'The committed transition.',
    schema: envelopeSchemaOf(AdminProductionTransitionResultResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed job id or body, a cancellation with no reason, or a reason on a transition ' +
      'that records none.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such production job.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'LC-18 does not allow that move; the order is on hold or being cancelled; the order is ' +
      'not in the state the move requires; the deposit is not satisfied; the job’s approval is ' +
      'no longer the order’s; or a required inventory reservation is missing, terminal or ' +
      'short. Nothing was committed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async transition(
    @Param() params: ProductionJobIdParam,
    @Body() body: TransitionProductionJobBody,
  ): Promise<AdminProductionTransitionResultPayload> {
    return guardedProductionOperation(async () => {
      const result = await this.jobs.transition({
        jobId: params.jobId,
        to: body.to,
        reason: body.reason,
      });
      return {
        jobId: result.job.id,
        orderId: result.job.orderId,
        fromStatus: result.fromStatus,
        status: result.job.status,
        orderStatus: result.orderStatus,
        reservationIds: result.reservationIds,
      };
    });
  }
}
