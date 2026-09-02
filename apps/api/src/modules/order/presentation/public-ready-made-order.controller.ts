/**
 * The one public Ready-Made order operation (`APP12-B02`).
 *
 *   POST /api/public/ready-made-orders — publicReadyMadeOrder_create
 *
 * One operation, not three. Order creation and its stock reservation are a
 * single atomic business command (`BR-023`, `BR-024`), so there is deliberately
 * no `reserve-stock`, no `validate-stock` and no `quote-order` route: each
 * would publish a decision that is only true until the next transaction, and a
 * client that acted on one would be acting on a promise the server never made.
 *
 * ### Where authorization happens
 *
 * A creation is authorized by a verified `SUBMISSION` challenge (GRD-001),
 * which the application re-reads inside its own transaction. A guard here could
 * only re-read it a second time, earlier and outside the transaction that has
 * to act on it, so there is none.
 *
 * Unlike `PublicCustomRequestController` there is **no session credential and
 * no Origin check**: Ready-Made checkout submits no Design Session, presents no
 * ambient `__Host-` cookie, and a caller must already hold a challenge id — so
 * there is nothing for a cross-site page to ride on, and an Origin requirement
 * would only refuse legitimate non-browser callers. That is the same reasoning
 * `APP5-B01` records for its own COP branch.
 *
 * ### Wave 1
 *
 * This is a **released** operation (`APP12-G02`): it must work with
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, because Ready-Made *is* Wave 1.
 * Its id is in `WAVE1_RELEASED_PUBLIC_OPERATIONS`, and the release-gate
 * contract test fails if it is ever moved or left unclassified.
 *
 * The handler builds no envelope and maps no success shape — it declares its
 * success code and returns data, exactly as every other controller does.
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { CreateReadyMadeOrderUseCase } from '../application/ready-made/create-ready-made-order.use-case';
import type { CreatedReadyMadeOrderResult } from '../domain/ready-made/ready-made-order-result.codec';
import {
  isReadyMadeOrderError,
  readyMadeOrderFailureResponse,
} from '../domain/ready-made/ready-made-order.errors';
import {
  ReadyMadeOrderAccessBootstrapResponse,
  ReadyMadeOrderCreatedResponse,
  ReadyMadeOrderSubtotalResponse,
} from './schemas/public-ready-made-order.response';
import {
  createReadyMadeOrderSchema,
  CreateReadyMadeOrderBody,
} from './schemas/public-ready-made-order.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('publicReadyMadeOrder')
@ApiExtraModels(
  ReadyMadeOrderCreatedResponse,
  ReadyMadeOrderSubtotalResponse,
  ReadyMadeOrderAccessBootstrapResponse,
)
@Controller('public/ready-made-orders')
export class PublicReadyMadeOrderController {
  constructor(private readonly orders: CreateReadyMadeOrderUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('READY_MADE_ORDER_CREATED', 'Ready-Made order created.')
  @ApiOperation({
    summary: 'Place a Ready-Made order',
    description:
      'Creates one READY_MADE order at AWAITING_SHIPPING_FEE from a verified SUBMISSION ' +
      'challenge, freezes the merchandise line and reserves the stock for 24 hours — all in ' +
      'one transaction. The server re-resolves the price and re-checks availability under the ' +
      'stock lock, so no amount or quantity a client observed earlier is trusted. The ' +
      'challenge is also the idempotency scope: re-sending the same body replays the same ' +
      'result, and re-using it for a different body is refused. No payment obligation is ' +
      'created here — an operator sets the shipping fee first.',
  })
  @ApiBody({ type: CreateReadyMadeOrderBody })
  @ApiResponse({
    status: 201,
    description: 'The created order, or the replayed result of an earlier identical request.',
    schema: envelopeSchemaOf(ReadyMadeOrderCreatedResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT, or an order on this challenge is already in flight.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'VERIFIED_CONTACT_REQUIRED, SKU_NOT_AVAILABLE or INSUFFICIENT_STOCK.',
    schema: ERROR_SCHEMA,
  })
  async create(@Body() body: CreateReadyMadeOrderBody): Promise<CreatedReadyMadeOrderResult> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use `createReadyMadeOrderSchema`, so they cannot disagree —
    // and nothing here casts request data.
    const input = createReadyMadeOrderSchema.parse(body);

    try {
      return await this.orders.create({
        challengeId: input.challengeId,
        skuId: input.skuId,
        quantity: input.quantity,
        delivery: {
          recipientName: input.delivery.recipientName,
          recipientPhone: input.delivery.recipientPhone,
          addressLine: input.delivery.addressLine,
          ...(input.delivery.ward === undefined ? {} : { ward: input.delivery.ward }),
          ...(input.delivery.district === undefined ? {} : { district: input.delivery.district }),
          province: input.delivery.province,
        },
      });
    } catch (error: unknown) {
      if (isReadyMadeOrderError(error)) {
        throw readyMadeOrderFailureResponse(error.failure);
      }
      throw error;
    }
  }
}
