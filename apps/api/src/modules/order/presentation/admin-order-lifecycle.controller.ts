/**
 * The one Admin order lifecycle route (`APP9-B01` §3, §4).
 *
 * ```text
 * POST /api/admin/orders/{orderId}/transitions — adminOrder_transition
 * ```
 *
 * **One operation, and one target behind it.** `TR-LC14-05` is APP9's entry:
 * an operator deliberately opens the final-payment window on an order whose
 * production is complete, and the order's LC-14 state is what makes the
 * `REMAINING` obligation — created with the order and untouched since — payable.
 * There is no "make payable" route, no "remaining eligibility" probe and no
 * second lifecycle endpoint: a flag that only a second call could set would be a
 * state the order row does not hold, and a probe would publish an answer that is
 * stale the moment it is read.
 *
 * `transitions` is a collection because each accepted command appends an
 * `order_transitions` row: the request creates a transition. The receipt is
 * `200`, not `201` — the appended row has no id of its own and is addressable
 * only as part of the order's history.
 *
 * ### It is a second Admin order controller, and that is the point
 *
 * `AdminOrderController` is defined by what it cannot inject: `APP7-B02`'s two
 * reads live in a module holding no `ORDER_REPOSITORY`, so no route there can
 * move an order. B01 must move one. Adding the mutation to that module would
 * hand two GET routes a `transition()` and quietly retire a boundary the
 * previous checkpoint was accepted on, so the write authority arrives in its own
 * module and both classes publish into the one `adminOrder` domain through
 * `CONTROLLER_DOMAIN_KEYS` — the same mechanism ten other split surfaces use, so
 * a composition decision does not name a public identifier.
 *
 * ### There is no customer or public final-payment route here
 *
 * Opening the window is an Admin decision. `APP9-B02` owns the customer's read
 * of the payable `REMAINING` obligation, its bank-transfer instructions and its
 * QR, behind the existing `REQUEST_ACCESS` grant; nothing in this controller is
 * reachable without an Admin session.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on the mutation — the exact combination every Admin
 * mutation in this repository uses. The handler accepts no operator identity:
 * the actor is bound by the guard and read from the request context inside the
 * use case, never from the body.
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
import { OpenFinalPaymentUseCase } from '../application/admin/open-final-payment.use-case';
import { guardedOrderFinalPayment } from '../domain/lifecycle/order-final-payment.errors';
import { AdminOrderIdParam } from './schemas/admin-order.request';
import { TransitionAdminOrderBody } from './schemas/admin-order-transition.request';
import {
  AdminOrderTransitionResultResponse,
  type AdminOrderTransitionResultPayload,
} from './schemas/admin-order-transition.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminOrder')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminOrderTransitionResultResponse)
export class AdminOrderLifecycleController {
  constructor(private readonly finalPayment: OpenFinalPaymentUseCase) {}

  @Post(':orderId/transitions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('ORDER_TRANSITIONED', 'Order moved.')
  @ApiOperation({
    summary: 'Open final payment on an order whose production is complete',
    description:
      'Moves the order from PRODUCTION_COMPLETED to AWAITING_FINAL_PAYMENT (TR-LC14-05), in ' +
      'one transaction that commits together or not at all.\n\n' +
      'It requires the order to be exactly PRODUCTION_COMPLETED — an order on hold or still ' +
      'in production is refused — and it requires the order to have a live REMAINING payment ' +
      'obligation. That obligation was created beside the DEPOSIT one when the order was ' +
      'converted from the accepted quotation, and this command **does not create it, change ' +
      'its amount or satisfy it**: the order’s new lifecycle state is what opens the payment ' +
      'window. A DEPOSIT obligation cannot stand in for it, and a missing REMAINING ' +
      'obligation is refused rather than repaired.\n\n' +
      'It collects nothing. No payment attempt is opened, no bank-transfer instruction or QR ' +
      'is produced, no evidence is accepted and no customer message is sent — the customer ' +
      'final-payment surface is a separate capability. It does not verify a payment, touch ' +
      'shipping, dispatch or complete the order.\n\n' +
      'Replaying the command after it has committed is refused: TR-LC14-05 is legal from one ' +
      'state only, so a retry finds the order already in AWAITING_FINAL_PAYMENT and appends ' +
      'no second transition.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: TransitionAdminOrderBody })
  @ApiResponse({
    status: 200,
    description: 'The committed transition.',
    schema: envelopeSchemaOf(AdminOrderTransitionResultResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed order id or body, or a target this operation does not perform.',
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
      'The order is not PRODUCTION_COMPLETED, or it has no live REMAINING payment obligation. ' +
      'Nothing was committed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async transition(
    @Param() params: AdminOrderIdParam,
    // Parsed and narrowed by the global pipe against the same strict schema the
    // DTO was built from; the target is a closed one-member enum, so an unknown
    // LC-14 value never reaches the use case. The parsed value is not read
    // again: with one legal target there is nothing left to branch on, and a
    // switch over a one-member union would be a decision that does not exist.
    @Body() body: TransitionAdminOrderBody,
  ): Promise<AdminOrderTransitionResultPayload> {
    void body;

    return guardedOrderFinalPayment(async () => {
      const result = await this.finalPayment.open(params.orderId);
      return {
        orderId: result.orderId,
        code: result.code,
        fromStatus: result.fromStatus,
        status: result.status,
        remainingObligationId: result.remainingObligationId,
        remainingObligationStatus: result.remainingObligationStatus,
      };
    });
  }
}
