/**
 * The one secure Ready-Made order operation (`APP12-B04` §11).
 *
 * ```text
 * POST /api/public/ready-made-orders/current — publicReadyMadeOrder_current
 * ```
 *
 * ### A second class in the same published domain
 *
 * `CONTROLLER_DOMAIN_KEYS` maps this class onto `publicReadyMadeOrder`, so the
 * family reads `_create`, `_current` and `APP12-B02`'s accepted id does not
 * move. It is a second class because `ReadyMadeOrderModule` is *defined* by
 * holding the creation command's collaborators — the transaction manager, the
 * idempotency store, the inventory writer, the order writer and the grant
 * issuer — and a read route that could reach any of them would be a read route
 * that could place an order, reserve stock or mint a credential.
 *
 * ### No locator
 *
 * There is no `/{orderId}` and no order code in the body: the order is read
 * from the `ORDER_ACCESS` grant row. A public route that took an order id would
 * be an enumeration oracle for other customers' orders, and a route that took
 * an order *code* would be worse — the code is printed on the customer's own
 * confirmation and is explicitly never an authorization input (CST-026).
 *
 * ### `POST`, for a read
 *
 * The credential is a bearer token, and `ADR-APP4-001` §11 makes the URL
 * fragment its only browser carrier: a query or path carrier is `FORBIDDEN`
 * with no fallback, because both are written to the Nginx access log, the
 * application request log, every proxy in between, and the `Referer` header of
 * any link the page later renders. So the token travels in a JSON body, which
 * makes this a `POST` despite consuming nothing. `ADR-DB3-004` r2 keeps a link
 * multi-use within its validity, so a customer refreshing their order page must
 * not burn it.
 *
 * ### Why there is no guard
 *
 * The credential is the token, and it is digested and resolved inside the
 * application service that acts on it. A guard could only read it earlier, and
 * `APP12-G02`'s global release guard deliberately admits this operation: the
 * wave is decided from the resolved grant's scope, not from the operation id.
 *
 * ### Wave 1
 *
 * A **released** operation: it must work with
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, because Ready-Made *is* Wave 1.
 * Its id is in `WAVE1_RELEASED_PUBLIC_OPERATIONS`, and the release-gate
 * contract test fails if it is ever moved or left unclassified.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import {
  isSecureLinkError,
  toSecureLinkHttpException,
} from '../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../customer/infrastructure/rate-limit/public-network-key.service';
import { ReadReadyMadeOrder } from '../application/ready-made/read-ready-made-order.query';
import type { ReadyMadeOrderView } from '../application/ready-made/ready-made-order.view';
import {
  ReadReadyMadeOrderBody,
  readReadyMadeOrderSchema,
} from './schemas/public-ready-made-order-access.request';
import {
  ReadyMadeOrderAccessResponse,
  ReadyMadeOrderDeliveryResponse,
  ReadyMadeOrderItemResponse,
  ReadyMadeOrderPaymentResponse,
  type ReadyMadeOrderAccessHttpView,
} from './schemas/public-ready-made-order-access.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicReadyMadeOrder')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  ReadyMadeOrderAccessResponse,
  ReadyMadeOrderItemResponse,
  ReadyMadeOrderDeliveryResponse,
  ReadyMadeOrderPaymentResponse,
)
@Controller('public/ready-made-orders')
export class PublicReadyMadeOrderAccessController {
  constructor(private readonly orders: ReadReadyMadeOrder) {}

  @Post('current')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('READY_MADE_ORDER_READ', 'Ready-Made order read.')
  @ApiOperation({
    summary: 'Read the Ready-Made order a secure link opens',
    description:
      'Returns the one Ready-Made order the presented secure link grants access to. The ' +
      'order comes from the grant, so no order id, order code, obligation id or customer ' +
      'identifier is accepted or returned. It answers in every state the order can reach. ' +
      'Before an operator sets the shipping fee there is no delivery fee and no payment ' +
      'object at all — not a zero and not a provisional total — because no amount is owed ' +
      'yet; once the fee is set, `payment.payableTotal` carries the exact figure the ' +
      'obligation froze, and a later fee correction is reflected because only the live ' +
      'obligation is ever read. The payment deadline is the reserved stock’s own expiry, ' +
      'read rather than recomputed, and disappears once the reservation no longer stands. ' +
      'Reading writes nothing: no state moves, no fee changes, no reservation is extended ' +
      'and the link is not consumed. Every token that does not open a live order grant — ' +
      'unknown, expired, revoked, superseded, or issued for a custom request rather than an ' +
      'order — answers with one identical 404.',
  })
  @ApiBody({ type: ReadReadyMadeOrderBody })
  @ApiResponse({
    status: 200,
    description: 'The order this link opens, projected for its customer.',
    schema: envelopeSchemaOf(ReadyMadeOrderAccessResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token. Identical in ' +
      'status, code, message and shape whether the token is unknown, expired, revoked, ' +
      'superseded, for a custom request rather than an order, or for an order that no longer ' +
      'exists.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Secure-link resolution is not configured.',
    schema: ERROR_SCHEMA,
  })
  async current(
    @Body() body: ReadReadyMadeOrderBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<ReadyMadeOrderAccessHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readReadyMadeOrderSchema.parse(body);

    try {
      const outcome = await this.orders.read(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return toHttpView(outcome.view);
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        throw toSecureLinkHttpException(error);
      }
      // Anything else propagates to the platform filter, which sanitises it.
      // Catching more broadly here is how a `PersistenceError` — whose
      // diagnostics name a constraint — would be shaped into a response by this
      // file, and how a database fault would become a token-validity signal.
      throw error;
    }
  }
}

/**
 * The one projection, and the only place these instants become strings.
 *
 * Optional fields are **spread**, never assigned as `undefined`, so an order
 * without a fee publishes no `feeAmount` key at all rather than a null one —
 * "not priced yet" and "priced at nothing" have to be different answers on the
 * wire, not only in prose. `terminationReason` follows the same rule: an
 * ordinary cancellation publishes no key, which is a different answer from a
 * reason the server could not determine.
 *
 * Every amount is copied. There is no `Number()` and no arithmetic in this file:
 * a `numeric(14,2)` that became a float here would be rounded on the customer's
 * payment screen, and the subtotal, the fee and the total are deliberately not
 * combined — `payableTotal` is the obligation's own figure, not a sum taken at
 * render time.
 */
function toHttpView(view: ReadyMadeOrderView): ReadyMadeOrderAccessHttpView {
  return {
    orderCode: view.orderCode,
    status: view.status,
    ...(view.terminationReason === undefined ? {} : { terminationReason: view.terminationReason }),
    currencyCode: view.currencyCode,
    placedAt: view.placedAt.toISOString(),
    item: {
      productName: view.item.productName,
      ...(view.item.variantLabel === undefined ? {} : { variantLabel: view.item.variantLabel }),
      ...(view.item.sizeLabel === undefined ? {} : { sizeLabel: view.item.sizeLabel }),
      quantity: view.item.quantity,
      unitPriceAmount: view.item.unitPriceAmount,
      lineTotalAmount: view.item.lineTotalAmount,
      currencyCode: view.item.currencyCode,
    },
    merchandiseSubtotal: view.merchandiseSubtotal,
    ...(view.delivery === undefined
      ? {}
      : {
          delivery: {
            recipientName: view.delivery.recipientName,
            recipientPhone: view.delivery.recipientPhone,
            addressLine: view.delivery.addressLine,
            ...(view.delivery.ward === undefined ? {} : { ward: view.delivery.ward }),
            ...(view.delivery.district === undefined ? {} : { district: view.delivery.district }),
            province: view.delivery.province,
            ...(view.delivery.feeAmount === undefined
              ? {}
              : { feeAmount: view.delivery.feeAmount }),
          },
        }),
    ...(view.payment === undefined
      ? {}
      : {
          payment: {
            status: view.payment.status,
            payableTotal: view.payment.payableTotal,
            payable: view.payment.payable,
          },
        }),
    ...(view.paymentDeadline === undefined
      ? {}
      : { paymentDeadline: view.paymentDeadline.toISOString() }),
    accessExpiresAt: view.accessExpiresAt.toISOString(),
  };
}
