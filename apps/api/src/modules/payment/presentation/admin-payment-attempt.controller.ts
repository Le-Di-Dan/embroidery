/**
 * The two Admin payment mutations (`APP7-B04`).
 *
 * ```text
 * POST /api/admin/payment-attempts/{attemptId}/verify — adminPaymentAttempt_verify
 * POST /api/admin/payment-attempts/{attemptId}/review — adminPaymentAttempt_review
 * ```
 *
 * Two, and no third. There is no `/fail`, `/expire`, `/retry` or `/cancel`:
 * `APP7-B04` creates no attempt and terminalises none by hand — a retry is a new
 * attempt, which is `APP7-B03`'s customer-initiated operation, and expiry is a
 * sweep nothing in this phase owns. There is no `PUT` or `DELETE` on a
 * reconciliation either: `payment_reconciliations` is append-only under an S24
 * trigger, and the surface says so by having no route that could address one.
 *
 * ### The attempt is the resource, not the order
 *
 * Both routes address `payment-attempts/{attemptId}` rather than nesting under
 * an order. The attempt is what the decision acts on, the id is what the read
 * operation hands the operator, and nesting would put an `orderId` in the path
 * that the server has to re-derive from the attempt anyway — a second locator
 * that can disagree with the first. `attemptId` is a **locator only**: the
 * obligation, the order, the amount owed and the expected reference are all read
 * from the database inside the transaction.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, plus `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on both handlers — the exact combination every Admin
 * mutation in this repository already uses, and both of these carry a body, so
 * the JSON content-type check has something to check. No cookie is parsed here,
 * no session is looked up, and neither handler accepts an operator identity: the
 * Admin id is bound by the guard and read from the request context inside the
 * use case.
 *
 * ### A mismatch is a `200`, not a `409`
 *
 * `verify` answers `200` whether the observed facts matched or contradicted. A
 * contradiction is a **committed** outcome — the attempt moves to
 * `REQUIRES_REVIEW`, the reconciliation is appended, and the response says so in
 * `attemptStatus` — because LC-16 `TR-LC16-05` owns a durable review and
 * `APP7-B04` §18 forbids downgrading it to an error the operator has to
 * remember. A `409` is reserved for commands that changed nothing: a terminal
 * attempt, or a deposit another attempt already satisfied.
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
import type { PaymentDecisionView } from '../application/admin/admin-payment.view';
import { ReviewPaymentAttemptUseCase } from '../application/admin/review-payment-attempt.use-case';
import { VerifyPaymentAttemptUseCase } from '../application/admin/verify-payment-attempt.use-case';
import { guardedPaymentVerification } from '../domain/verification/payment-verification.errors';
import {
  AdminPaymentAttemptParam,
  ReviewPaymentAttemptBody,
  VerifyPaymentAttemptBody,
} from './schemas/admin-payment.request';
import {
  PaymentDecisionResponse,
  type PaymentDecisionPayload,
} from './schemas/admin-payment.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminPaymentAttempt')
@ApiCookieAuth('adminSession')
@Controller('admin/payment-attempts')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(PaymentDecisionResponse)
export class AdminPaymentAttemptController {
  constructor(
    private readonly verification: VerifyPaymentAttemptUseCase,
    private readonly reviews: ReviewPaymentAttemptUseCase,
  ) {}

  /**
   * 200, not 201: no resource is created. The attempt already exists and this
   * settles it, so there is no location to return and nothing new to name.
   */
  @Post(':attemptId/verify')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PAYMENT_ATTEMPT_VERIFIED', 'Payment attempt verification recorded.')
  @ApiOperation({
    summary: 'Verify one bank-transfer deposit attempt against funds received',
    description:
      'The only operation in this phase that can move money state. The server proves the whole ' +
      'chain inside one transaction — the attempt belongs to this obligation, the obligation is ' +
      'the DEPOSIT one, it belongs to this order, and the attempt is a bank transfer — then ' +
      'compares the operator’s observed amount and reference against the obligation’s own ' +
      'frozen amount and the reference derived from the order code. Exact match only: no ' +
      'tolerance, no rounding and no floating-point comparison. On a match the attempt becomes ' +
      '`SUCCEEDED`, the deposit becomes `SATISFIED` by that exact attempt, the order moves ' +
      '`AWAITING_DEPOSIT` → `DEPOSIT_PAID`, a reconciliation is appended and `payment.verified` ' +
      'is emitted once — all atomically, or none of it. On a mismatch nothing is satisfied, the ' +
      'order does not move, and the attempt is routed to `REQUIRES_REVIEW` with the operator’s ' +
      'reason: the response is still `200`, and `attemptStatus` says which happened. Transfer ' +
      'evidence is never a precondition — a correct payment with no screenshots verifies ' +
      'normally. Retrying a verification whose response was lost returns the committed truth ' +
      'with `replayed: true` and writes nothing a second time. No provider is contacted and no ' +
      'provider event is written.',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiBody({ type: VerifyPaymentAttemptBody })
  @ApiResponse({
    status: 200,
    description: 'The committed decision — verified, or routed to review.',
    schema: envelopeSchemaOf(PaymentDecisionResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed attempt id or body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such payment attempt.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The attempt is already settled, is not a deposit bank transfer, or the deposit was ' +
      'already satisfied by another attempt. Nothing changed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async verify(
    @Param() params: AdminPaymentAttemptParam,
    @Body() body: VerifyPaymentAttemptBody,
  ): Promise<PaymentDecisionPayload> {
    return guardedPaymentVerification(async () =>
      toPayload(
        await this.verification.verify({
          attemptId: params.attemptId,
          observedAmount: body.observedAmount,
          observedTransferReference: body.observedTransferReference,
          note: body.note,
        }),
      ),
    );
  }

  @Post(':attemptId/review')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('PAYMENT_ATTEMPT_REVIEW_RECORDED', 'Payment attempt routed to review.')
  @ApiOperation({
    summary: 'Route one payment attempt to manual review',
    description:
      'For the case the operator knows something the comparison cannot see — an unreadable ' +
      'memo, two transfers, a statement that disagrees with the customer. The attempt moves to ' +
      '`REQUIRES_REVIEW` with the mandatory reason, and a reconciliation records it. The ' +
      'deposit is **not** satisfied, the order does **not** move, no `payment.verified` is ' +
      'emitted and no provider event is written — there is no branch in this operation that ' +
      'could settle a payment. An observed amount or reference may be recorded when the ' +
      'operator has one; omitting them records nothing rather than a fabricated zero. A ' +
      'terminal attempt is refused: LC-16 never regresses.',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiBody({ type: ReviewPaymentAttemptBody })
  @ApiResponse({
    status: 200,
    description: 'The committed review, with the deposit and order reported unchanged.',
    schema: envelopeSchemaOf(PaymentDecisionResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed attempt id or body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such payment attempt.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The attempt is already settled, or is not a deposit bank transfer.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async review(
    @Param() params: AdminPaymentAttemptParam,
    @Body() body: ReviewPaymentAttemptBody,
  ): Promise<PaymentDecisionPayload> {
    return guardedPaymentVerification(async () =>
      toPayload(
        await this.reviews.review({
          attemptId: params.attemptId,
          reviewReason: body.reviewReason,
          observedAmount: body.observedAmount,
          observedTransferReference: body.observedTransferReference,
        }),
      ),
    );
  }
}

/** The receipt. Field by field, so an internal fact has nowhere to land. */
function toPayload(view: PaymentDecisionView): PaymentDecisionPayload {
  return {
    attemptId: view.attemptId,
    attemptStatus: view.attemptStatus,
    depositObligationId: view.depositObligationId,
    depositStatus: view.depositStatus,
    orderId: view.orderId,
    orderStatus: view.orderStatus,
    reconciliationAction: view.reconciliationAction,
    replayed: view.replayed,
  };
}
