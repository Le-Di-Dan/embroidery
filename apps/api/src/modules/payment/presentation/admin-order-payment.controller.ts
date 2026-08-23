/**
 * The one Admin deposit-payment read (`APP7-B04`).
 *
 * ```text
 * GET /api/admin/orders/{orderId}/payments — adminOrderPayment_read
 * ```
 *
 * One, and no second. There is no attempt collection route, no evidence
 * collection route and no per-evidence route: the attempts and their evidence
 * metadata are frozen children of one deposit, not resources addressed on their
 * own, and a URL minted now for `APP7-B06`'s private delivery would be a path
 * B06 would have to write to before it knows what serving one looks like.
 *
 * ### A separate class from the two mutations, and separate on purpose
 *
 * `AdminPaymentAttemptController` owns verify and review. The split exists for
 * the reason `AdminCustomRequestController` and
 * `AdminCustomRequestModerationController` are split: **this controller's module
 * holds no transaction manager, no `PAYMENT_OBLIGATION_REPOSITORY` and no
 * `ORDER_REPOSITORY`**, so no route on it can settle an attempt, satisfy an
 * obligation, move an order or append an outbox row. "The read is zero-write" is
 * therefore a property of the injector, not a claim about the code written today.
 *
 * The two classes are also two published domains — `adminOrderPayment` and
 * `adminPaymentAttempt` — and that is not a file-layout accident:
 * they are addressed by different resources (an order, an attempt) and no
 * `CONTROLLER_DOMAIN_KEYS` entry is owed, on the same footing as
 * `PublicCustomRequestAssetController`.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` is the exact guard `GET /api/staff/me` and every
 * Admin catalogue, request and order route already use. This controller parses
 * no cookie, looks up no session and accepts no caller-supplied Admin id. There
 * is no role check because there is no role model — APP1-B01 is a binary
 * authenticated-admin gate, and inventing a permission matrix here would be a
 * security model with no authority behind it.
 *
 * The route is a `GET` and it is safe. `orderId` is a path parameter because an
 * order id is not a secret and the caller is an authenticated operator who was
 * given it; no parameter here is a contact, a token or anything worth redacting
 * from a gateway access log.
 */
import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
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
import { ReadAdminOrderPayments } from '../application/admin/read-admin-order-payments.query';
import type { AdminOrderPaymentsView } from '../application/admin/admin-payment.view';
import { guardedAdminPaymentRead } from '../domain/verification/payment-verification.errors';
import {
  AdminOrderPaymentsResponse,
  AdminPaymentAttemptResponse,
  AdminPaymentEvidenceResponse,
  AdminPaymentReconciliationResponse,
  type AdminOrderPaymentsPayload,
} from './schemas/admin-payment.response';
import { AdminOrderPaymentsParam } from './schemas/admin-payment.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** An operational payment view must never be cached by a shared proxy. */
const ADMIN_PAYMENT_CACHE_CONTROL = 'no-store';

@ApiTags('adminOrderPayment')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminOrderPaymentsResponse,
  AdminPaymentAttemptResponse,
  AdminPaymentEvidenceResponse,
  AdminPaymentReconciliationResponse,
)
export class AdminOrderPaymentController {
  constructor(private readonly payments: ReadAdminOrderPayments) {}

  @Get(':orderId/payments')
  @Header('Cache-Control', ADMIN_PAYMENT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_ORDER_PAYMENTS_READ', 'Order payments retrieved.')
  @ApiOperation({
    summary: 'Get one order’s deposit payment facts',
    description:
      'Everything an operator needs to verify a deposit: the order’s LC-14 state, the DEPOSIT ' +
      'obligation with the exact amount owed and its currency, the transfer reference the ' +
      'customer was told to use, every attempt against that deposit with its LC-16 state, the ' +
      'metadata of any transfer screenshots the customer submitted, and the manual ' +
      'reconciliation history. The expected amount is the obligation’s own frozen column — no ' +
      'deposit percentage is recomputed and no live quotation or catalog price is read. The ' +
      'reference is derived from the order code and stored nowhere. Evidence is **supporting ' +
      'material**: its status is never a payment status, an empty list is an ordinary valid ' +
      'deposit, and no image bytes are served here — `APP7-B06` owns the private delivery. The ' +
      'remaining payment is not shown and is not collectible in this phase. It is a read: ' +
      'nothing is written, no status moves and no event is appended.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The order’s deposit payment vertical.',
    schema: envelopeSchemaOf(AdminOrderPaymentsResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed order id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such order.', schema: ERROR_SCHEMA })
  async read(@Param() params: AdminOrderPaymentsParam): Promise<AdminOrderPaymentsPayload> {
    return guardedAdminPaymentRead(async () => toPayload(await this.payments.read(params.orderId)));
  }
}

/**
 * The projection.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later — a storage key added to the evidence
 * view would have to be added here too, deliberately, before it could reach a
 * browser.
 */
function toPayload(view: AdminOrderPaymentsView): AdminOrderPaymentsPayload {
  return {
    orderId: view.orderId,
    orderCode: view.orderCode,
    orderStatus: view.orderStatus,
    depositObligationId: view.depositObligationId,
    depositStatus: view.depositStatus,
    expectedAmount: view.expectedAmount,
    expectedCurrencyCode: view.expectedCurrencyCode,
    expectedTransferReference: view.expectedTransferReference,
    satisfiedByAttemptId: view.satisfiedByAttemptId,
    satisfiedAt: view.satisfiedAt?.toISOString(),
    attempts: view.attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      method: attempt.method,
      status: attempt.status,
      amount: attempt.amount,
      currencyCode: attempt.currencyCode,
      reviewReason: attempt.reviewReason,
      succeededAt: attempt.succeededAt?.toISOString(),
      failedAt: attempt.failedAt?.toISOString(),
      expiresAt: attempt.expiresAt?.toISOString(),
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
      evidence: attempt.evidence.map((item) => ({
        evidenceId: item.evidenceId,
        assetStatus: item.assetStatus,
        mediaType: item.mediaType,
        byteSize: item.byteSize,
        createdAt: item.createdAt.toISOString(),
        previewEligible: item.previewEligible,
      })),
    })),
    reconciliations: view.reconciliations.map((row) => ({
      reconciliationId: row.reconciliationId,
      paymentAttemptId: row.paymentAttemptId,
      action: row.action,
      resolvedStatus: row.resolvedStatus,
      amount: row.amount,
      reason: row.reason,
      adminId: row.adminId,
      bankReference: row.bankReference,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
