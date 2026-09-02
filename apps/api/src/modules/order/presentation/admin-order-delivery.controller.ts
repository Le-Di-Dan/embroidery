/**
 * The two Admin delivery routes (`APP9-B05` §3, §4).
 *
 * ```text
 * POST /api/admin/orders/{orderId}/dispatch     — adminOrder_dispatch
 * POST /api/admin/orders/{orderId}/completion   — adminOrder_complete
 * ```
 *
 * **Two operations, because they are two decisions.** `TR-LC14-07` records that
 * the parcel left and freezes the address it left for; `TR-LC14-08` records that
 * the operator considers the order closed. Between them the order sits in
 * `DELIVERED` for however long delivery takes, so one endpoint doing both would
 * make that state unobservable and would drive an order into a terminal state on
 * a decision nobody made.
 *
 * ### Why verbs rather than `POST …/transitions`
 *
 * `APP9-B01` owns `POST /api/admin/orders/{orderId}/transitions` with a
 * one-member target enum, and widening that enum would deliver these two moves
 * as **zero** new operations — a client could not tell which target its
 * generated method performs, and the accepted `adminOrder_transition` receipt
 * shape (which publishes the `REMAINING` obligation the final-payment entry
 * required) means nothing for a dispatch. So each command gets its own
 * operation, the shape `POST …/{attemptId}/verify`, `…/review` and
 * `…/versions/{versionId}/send` already established for guarded Admin commands
 * that are not a generic state move. Both publish into the one `adminOrder`
 * domain through `CONTROLLER_DOMAIN_KEYS`, so a composition decision does not
 * name a public identifier.
 *
 * ### Neither takes a body
 *
 * There is nothing for a caller to say. The order is named by the path; the
 * address, fee, carrier note and tracking note are already in `shipping_details`
 * where `APP9-B04`'s `PUT` put them; the dispatch instant is the server's; and
 * the operator is bound by the guard. A body would only be a place to smuggle a
 * carrier prerequisite or an operator-supplied timestamp into a frozen record.
 * `AdminQuotationSendController` is the delivered precedent for a parameterless
 * Admin command, down to the guard set: `StaffOriginGuard` without
 * `StaffJsonBodyGuard`, because a request with no body has no JSON body to
 * guard and the origin allowlist is what refuses a cross-site form post.
 *
 * ### It is a third Admin order controller, and that is the point
 *
 * `AdminOrderController` (`APP7-B02`) is defined by holding no order writer, and
 * `AdminOrderLifecycleController` (`APP9-B01`) is defined by holding no shipping
 * or freeze authority. B05 needs the freeze writer and the obligation reader, so
 * it arrives in its own module rather than retiring a boundary an accepted
 * checkpoint was reviewed on.
 *
 * ### No tracking surface
 *
 * There is no carrier-status route, no shipment-timeline route, no delivery-
 * confirmation route and no customer tracking endpoint. `LIVE_CARRIER_TRACKING`
 * is out of scope; `carrier_name` and `tracking_code` are static internal notes
 * that travel into the snapshot and are read back through the Admin shipping
 * route.
 */
import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
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
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { CompleteOrderUseCase } from '../application/admin/complete-order.use-case';
import { DispatchOrderUseCase } from '../application/admin/dispatch-order.use-case';
import { guardedOrderDelivery } from '../domain/lifecycle/order-delivery.errors';
import { AdminOrderIdParam } from './schemas/admin-order.request';
import {
  AdminOrderCompletionResponse,
  AdminOrderDispatchResponse,
  type AdminOrderCompletionPayload,
  type AdminOrderDispatchPayload,
} from './schemas/admin-order-delivery.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminOrder')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminOrderDispatchResponse, AdminOrderCompletionResponse)
export class AdminOrderDeliveryController {
  constructor(
    private readonly dispatching: DispatchOrderUseCase,
    private readonly completion: CompleteOrderUseCase,
  ) {}

  /**
   * 200, not 201: no resource this API addresses is created. The snapshot and
   * the transition are both evidence composed under the order, with no route of
   * their own, so there is no location to return.
   */
  @Post(':orderId/dispatch')
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('ORDER_DISPATCHED', 'Order dispatched.')
  @ApiOperation({
    summary: 'Dispatch an order that is ready for delivery, freezing its shipping details',
    description:
      'Moves the order from READY_FOR_DELIVERY to DELIVERED (TR-LC14-07) and, in the **same** ' +
      'transaction, freezes its shipping details and copies them into the order’s one shipping ' +
      'snapshot. All of it commits together or none of it does: there is no committed state in ' +
      'which the order is dispatched and its address is still editable, and none in which a ' +
      'snapshot exists with no transition explaining it.\n\n' +
      'Two canonical guards are evaluated inside that transaction before anything is written. ' +
      'GRD-017 requires a shipping detail that is complete enough to freeze — it must exist, ' +
      'still be editable, and carry a shipping fee, because the snapshot records an amount and ' +
      'a freeze with no fee would record one nobody agreed to. **A carrier name and a tracking ' +
      'code are not required**: they are static internal notes, copied into the snapshot when ' +
      'present. GRD-016 requires the payment the order actually settles on to be SATISFIED — ' +
      'the live REMAINING obligation for a custom order, the live FULL one for a Ready-Made ' +
      'order, chosen from the order’s own immutable origin. The lifecycle state is not taken ' +
      'as proof of it, because a shipping-fee recalculation can replace a satisfied payment ' +
      'with a new pending one without moving the order.\n\n' +
      'It is one command for both kinds of commerce. A Ready-Made order needs no production ' +
      'job, quotation, design approval or deposit to be dispatched — only that it is ' +
      'READY_FOR_DELIVERY, which it reaches when its full payment is verified.\n\n' +
      'After it commits, the shipping details are immutable: the Admin shipping write refuses ' +
      'them and a database trigger rejects any mutation. Corrections after this point are ' +
      'recorded as compensating events, never as edits.\n\n' +
      'It contacts no carrier, polls no courier, opens no tracking lifecycle and sends no ' +
      'customer message. It changes no payment obligation, attempt or reconciliation — the ' +
      'balance is read, not touched — and it does not complete the order, which is a separate ' +
      'command.\n\n' +
      'Replaying it after it has committed is refused: TR-LC14-07 is legal from one state ' +
      'only, so a retry finds the order already DELIVERED and creates no second snapshot and ' +
      'no second transition.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The committed dispatch, with the freeze it produced.',
    schema: envelopeSchemaOf(AdminOrderDispatchResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed order id.', schema: ERROR_SCHEMA })
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
      'ORDER_INVALID_TRANSITION — the order is not READY_FOR_DELIVERY, which includes an order ' +
      'already dispatched; ORDER_SHIPPING_NOT_READY — GRD-017, the shipping details are ' +
      'missing or incomplete; ORDER_REMAINING_PAYMENT_UNSATISFIED — GRD-016, the balance is ' +
      'not settled; ORDER_REMAINING_PAYMENT_MISSING — the order has no live obligation of ' +
      'the kind its origin settles on. Nothing was committed in any of the four cases.',
    schema: ERROR_SCHEMA,
  })
  async dispatch(@Param() params: AdminOrderIdParam): Promise<AdminOrderDispatchPayload> {
    return guardedOrderDelivery(async () => {
      const result = await this.dispatching.dispatch(params.orderId);
      return {
        orderId: result.orderId,
        code: result.code,
        fromStatus: result.fromStatus,
        status: result.status,
        dispatchedAt: result.dispatchedAt.toISOString(),
        shippingStatus: result.shippingStatus,
        frozenAt: result.frozenAt.toISOString(),
      };
    });
  }

  /** 200 — the order reaches its terminal state; nothing is created. */
  @Post(':orderId/completion')
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('ORDER_COMPLETED', 'Order completed.')
  @ApiOperation({
    summary: 'Complete an order that has been delivered',
    description:
      'Moves the order from DELIVERED to COMPLETED (TR-LC14-08), the terminal state of the ' +
      'order lifecycle. GRD-018 is the whole guard: the order must already be DELIVERED, so an ' +
      'order still awaiting dispatch is refused.\n\n' +
      'It records the move and nothing else. It does not freeze shipping again or create a ' +
      'second snapshot — the freeze happened at dispatch and there is exactly one snapshot per ' +
      'order. It changes no payment obligation, no shipping detail and no inventory, contacts ' +
      'no carrier and sends no customer message.\n\n' +
      'It is deliberately separate from dispatch: an order sits in DELIVERED for as long as ' +
      'delivery takes, and COMPLETED has no successor to walk back from.\n\n' +
      'Replaying it after it has committed is refused, and appends no second transition.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The committed completion.',
    schema: envelopeSchemaOf(AdminOrderCompletionResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed order id.', schema: ERROR_SCHEMA })
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
      'ORDER_INVALID_TRANSITION — the order is not DELIVERED, which includes an order already ' +
      'completed. Nothing was committed.',
    schema: ERROR_SCHEMA,
  })
  async complete(@Param() params: AdminOrderIdParam): Promise<AdminOrderCompletionPayload> {
    return guardedOrderDelivery(async () => {
      const result = await this.completion.complete(params.orderId);
      return {
        orderId: result.orderId,
        code: result.code,
        fromStatus: result.fromStatus,
        status: result.status,
      };
    });
  }
}
