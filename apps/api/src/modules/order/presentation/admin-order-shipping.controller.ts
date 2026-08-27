/**
 * The two Admin shipping-detail routes (`APP9-B04` §3, §4).
 *
 * ```text
 * GET /api/admin/orders/{orderId}/shipping-detail — adminOrderShipping_read
 * PUT /api/admin/orders/{orderId}/shipping-detail — adminOrderShipping_save
 * ```
 *
 * **Two operations, and the pair is the whole surface.** There is no `freeze`
 * route, no `dispatch` route, no `shipping-fee` route, no `acknowledgement`
 * route and no `tracking` route. Freeze is not a command at all — it happens
 * inside `APP9-B05`'s dispatch transaction (`TR-LC14-07`) — and the fee and its
 * acknowledgement are *consequences* of saving the detail, composed into the
 * same transaction rather than exposed as endpoints an operator could call out
 * of order. A separate acknowledgement endpoint would also be the one shape
 * `APP9-B04` §10 forbids: it would let the evidence be recorded apart from the
 * change it authorises.
 *
 * ### Why `PUT`, and why `shipping-detail` is singular
 *
 * An order has at most one shipping detail — `uq_shipping_details__order`
 * (CST-033) makes that physical — so the resource is a singleton, not a
 * collection, and there is no id to POST into. `PUT` is then the honest verb:
 * the body is the whole detail, the same request applied twice leaves the same
 * state, and the delivered writer is already an upsert on the order key. That
 * is also what makes a retry safe without a new idempotency subsystem (§14) —
 * the second call measures against the fee the first one stored, finds no
 * change, and writes no second acknowledgement or successor obligation.
 *
 * The receipt is `200`, never `201`: the detail is addressed by the order, so a
 * create and an update land on the identical URL and a `Location` header would
 * point back at the request URI.
 *
 * ### It is a third Admin order controller, and that is the point
 *
 * `AdminOrderController` (`APP7-B02`) is defined by holding no
 * `ORDER_REPOSITORY`, and `AdminOrderLifecycleController` (`APP9-B01`) holds one
 * but reaches no obligation writer. This surface needs both the shipping writer
 * and the recalculation, so it arrives with its own module rather than widening
 * either delivered boundary.
 *
 * It publishes its **own** domain, `adminOrderShipping`, and is deliberately not
 * added to `CONTROLLER_DOMAIN_KEYS`: that table is for classes split apart for
 * reasons that are not contract changes, and this is a distinct sub-resource
 * with its own read/write pair — exactly the precedent
 * `/api/admin/orders/{orderId}/payments` set as `adminOrderPayment`, and the
 * same reason `PublicCustomRequestAssetController` is kept out of the table.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on the mutation — the exact combination every Admin
 * mutation in this repository uses. Neither handler accepts an operator
 * identity: the actor is bound by the guard and read from the request context
 * inside the use case, never from the body. There is no `REQUEST_ACCESS` route
 * here and no Storefront path to either operation — ADR-DB3-004 makes pre-freeze
 * shipping edits Admin-only, and a customer change request is something an
 * operator applies through this same `PUT`.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
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
import { ReadShippingDetailQuery } from '../application/admin/read-shipping-detail.query';
import { SaveShippingDetailUseCase } from '../application/admin/save-shipping-detail.use-case';
import { guardedAdminShipping } from '../domain/shipping/admin-shipping.errors';
import { AdminOrderIdParam } from './schemas/admin-order.request';
import { SaveShippingDetailBody } from './schemas/admin-order-shipping.request';
import {
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
  AdminShippingFeeOutcomeResponse,
} from './schemas/admin-order-shipping.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminOrderShipping')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
  AdminShippingFeeOutcomeResponse,
)
export class AdminOrderShippingController {
  constructor(
    private readonly detail: ReadShippingDetailQuery,
    private readonly saving: SaveShippingDetailUseCase,
  ) {}

  @Get(':orderId/shipping-detail')
  @ApiSuccessCode('SHIPPING_DETAIL_READ', 'Shipping detail read.')
  @ApiOperation({
    summary: 'Read the shipping detail of one order',
    description:
      'Returns the order’s own shipping record (`shipping_details`), which is the authoritative ' +
      'delivery destination for this order. It is never derived from the customer profile, a ' +
      'contact point or an address book: the recipient may legitimately differ from the ' +
      'customer, and a later profile edit must not rewrite where an order was sent.\n\n' +
      'The read stays available **after** dispatch has frozen the detail, and reports that ' +
      'through `status` and `frozenAt`. Only the write is restricted to an editable detail.\n\n' +
      '`carrierName` and `trackingCode` are internal strings an operator recorded. There is no ' +
      'carrier integration behind them — nothing is called, polled or subscribed to, and no ' +
      'delivery state is derived from them.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The stored shipping detail.',
    schema: envelopeSchemaOf(AdminShippingDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed order id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No such order, or the order has no shipping detail yet.',
    schema: ERROR_SCHEMA,
  })
  async read(@Param() params: AdminOrderIdParam): Promise<AdminShippingDetailResponse> {
    return guardedAdminShipping(async () => {
      const detail = await this.detail.read(params.orderId);
      return {
        recipientName: detail.recipientName,
        recipientPhone: detail.recipientPhone,
        addressLine: detail.addressLine,
        ward: detail.ward ?? null,
        district: detail.district ?? null,
        province: detail.province,
        countryCode: detail.countryCode,
        feeAmount: detail.feeAmount ?? null,
        carrierName: detail.carrierName ?? null,
        trackingCode: detail.trackingCode ?? null,
        status: detail.status,
        frozenAt: detail.frozenAt?.toISOString() ?? null,
      };
    });
  }

  @Put(':orderId/shipping-detail')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('SHIPPING_DETAIL_SAVED', 'Shipping detail saved.')
  @ApiOperation({
    summary: 'Create or update the shipping detail of one order, before dispatch',
    description:
      'Saves the order’s shipping record while it is still `EDITABLE`, creating it if the order ' +
      'has none yet. One transaction commits everything below together or nothing at all.\n\n' +
      'A detail that is already `FROZEN` is refused: dispatch has snapshotted it, and the ' +
      'address an order was shipped to is evidence rather than a field. This operation never ' +
      'dispatches, freezes, thaws, creates a shipping snapshot, moves the order or completes ' +
      'it — the detail is still `EDITABLE` when the call returns.\n\n' +
      '**The shipping fee is money.** If the effective fee is unchanged, the shipping record ' +
      'changes and nothing in the payment record is touched: no obligation is superseded, no ' +
      'acknowledgement is recorded and no payment attempt is affected. If the fee changes, the ' +
      'live REMAINING obligation is **recalculated** the canonical way — it is marked ' +
      'SUPERSEDED, exactly one successor is created carrying the previous live amount moved by ' +
      'the fee difference, and the two are linked. The old obligation’s amount is never edited ' +
      'in place, and the deposit is never touched or recomputed.\n\n' +
      'A fee **increase** additionally requires the customer’s acknowledgement, and the ' +
      'evidence is resolved from the order’s own chain — an active in-scope secure grant on ' +
      'this order’s request, plus a fresh verified step-up by that customer. It cannot be ' +
      'asserted in the body. Without it the whole call is refused and nothing is written. A ' +
      'decrease is in the customer’s favour and needs none.\n\n' +
      'A fee change is refused outright once the remaining payment has been settled: there is ' +
      'no path that turns paid money back into a payable balance. Non-fee edits on such an ' +
      'order still succeed.\n\n' +
      'Replaying the same request is safe. The second call measures the fee against what the ' +
      'first one stored, finds no change, and records no second acknowledgement and no second ' +
      'successor obligation.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: SaveShippingDetailBody })
  @ApiResponse({
    status: 200,
    description: 'The saved detail, and what the fee change did.',
    schema: envelopeSchemaOf(AdminShippingDetailSavedResponse),
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
      'The detail is frozen; or a fee change was asked for and the order has no live remaining ' +
      'obligation, that obligation is already settled, the customer’s acknowledgement is ' +
      'missing, or the resulting balance would not be a valid amount. Nothing was committed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async save(
    @Param() params: AdminOrderIdParam,
    @Body() body: SaveShippingDetailBody,
  ): Promise<AdminShippingDetailSavedResponse> {
    return guardedAdminShipping(async () => {
      const result = await this.saving.save({
        orderId: params.orderId,
        recipientName: body.recipientName,
        recipientPhone: body.recipientPhone,
        addressLine: body.addressLine,
        ward: body.ward,
        district: body.district,
        province: body.province,
        feeAmount: body.feeAmount,
        carrierName: body.carrierName,
        trackingCode: body.trackingCode,
      });

      return {
        orderId: params.orderId,
        detail: {
          recipientName: result.detail.recipientName,
          recipientPhone: result.detail.recipientPhone,
          addressLine: result.detail.addressLine,
          ward: result.detail.ward ?? null,
          district: result.detail.district ?? null,
          province: result.detail.province,
          countryCode: result.detail.countryCode,
          feeAmount: result.detail.feeAmount ?? null,
          carrierName: result.detail.carrierName ?? null,
          trackingCode: result.detail.trackingCode ?? null,
          status: result.detail.status,
          frozenAt: result.detail.frozenAt?.toISOString() ?? null,
        },
        fee: {
          changed: result.fee.changed,
          previousFeeAmount: result.fee.previousFeeAmount,
          acknowledged: result.fee.acknowledged,
          supersededObligationId: result.fee.supersededObligationId ?? null,
          remainingObligationId: result.fee.remainingObligationId ?? null,
          remainingAmount: result.fee.remainingAmount ?? null,
        },
      };
    });
  }
}
