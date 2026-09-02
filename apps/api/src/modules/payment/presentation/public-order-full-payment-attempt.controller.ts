/**
 * The one customer full-payment write (`APP12-B04` §18).
 *
 * ```text
 * POST /api/public/orders/full-payment/attempts — publicOrderFullPayment_initiate
 * ```
 *
 * ### A separate class from the two reads
 *
 * The split is `APP7-B03`'s and exists for its reason: the read module holds no
 * transaction manager and no idempotency store, so a read cannot acquire one by
 * accident. Making the write live elsewhere is what enforces that, in the
 * composition root rather than in a review comment.
 *
 * ### The admission runs twice, deliberately
 *
 * `AuthorizeSecureLink` runs here, before the transaction opens, so a caller
 * cannot escape `secure_link.resolve`'s abuse budget by spreading token guesses
 * across the read, the QR and this write. It is **not** the authorization the
 * write acts on: the use case re-establishes the grant inside its own
 * transaction under its row lock (`ADR-DB3-004` r9), pinned to `ORDER_ACCESS`,
 * which is what makes a concurrent revoke win and what stops a custom
 * `REQUEST_ACCESS` token reaching this obligation.
 *
 * ### Wave 1
 *
 * A **released** operation (`APP12-G02`, extended by this checkpoint): it must
 * work with `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, because Ready-Made *is*
 * Wave 1. Its id is in `WAVE1_RELEASED_PUBLIC_OPERATIONS`.
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
import {
  ApiBody,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import {
  IDEMPOTENCY_KEY_HEADER,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  parseIdempotencyKey,
} from '../../asset/domain/idempotency-key';
import {
  isAssetIntakeError,
  toHttpException as toIdempotencyKeyHttpException,
} from '../../asset/domain/asset-intake.errors';
import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../customer/application/authorize-secure-link.service';
import {
  isSecureLinkError,
  toSecureLinkHttpException,
} from '../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../customer/infrastructure/rate-limit/public-network-key.service';
import { InitiateFullPaymentAttemptUseCase } from '../application/customer/initiate-full-payment-attempt.use-case';
import {
  isFullPaymentError,
  toFullPaymentHttpException,
} from '../domain/full-payment/full-payment.errors';
import {
  InitiateFullPaymentAttemptBody,
  initiateFullPaymentAttemptSchema,
} from './schemas/public-order-full-payment.request';
import {
  FullPaymentAttemptResponse,
  type FullPaymentAttemptHttpView,
} from './schemas/public-order-full-payment.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

interface IdempotencyHeaderRequest {
  readonly headers: Record<string, unknown>;
}

@ApiTags('publicOrderFullPayment')
@ApiExtraModels(FullPaymentAttemptResponse)
@Controller('public/orders')
export class PublicOrderFullPaymentAttemptController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly attempts: InitiateFullPaymentAttemptUseCase,
  ) {}

  @Post('full-payment/attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('FULL_PAYMENT_ATTEMPT_OPENED', 'Order payment attempt opened.')
  @ApiOperation({
    summary: 'Open one bank-transfer attempt against the Ready-Made order a secure link opens',
    description:
      'Records that the customer is about to transfer what the order costs. The order, the ' +
      'obligation, the amount, the currency and the step-up evidence are all resolved by the ' +
      'server from the grant — none of them is accepted from the caller, and no custom ' +
      'deposit or balance can be reached through this route. Inside one transaction the ' +
      'grant is re-checked under its row lock, the order must be AWAITING_PAYMENT and the ' +
      'obligation still PENDING, a recent re-verification of the customer’s own contact is ' +
      'required, and one BANK_TRANSFER attempt is created at PENDING for the obligation’s ' +
      'exact amount. If a shipping-fee correction has replaced the obligation, this binds to ' +
      'the live successor at its amount; the earlier attempt stays where it was, under the ' +
      'obligation it was opened against, and never becomes the successor’s. This is **not** ' +
      'a payment: no attempt is settled, no obligation is satisfied, no order becomes ' +
      'READY_FOR_DELIVERY and no reconciliation is written — only an Admin verifying that ' +
      'the money arrived can do any of that. Repeating the call with the same ' +
      'Idempotency-Key replays the same attempt and creates no second one; a deliberate ' +
      'retry sends a new key.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      `The caller’s own key for this attempt, ${String(MIN_IDEMPOTENCY_KEY_LENGTH)}–` +
      `${String(MAX_IDEMPOTENCY_KEY_LENGTH)} characters from A–Z a–z 0–9 . _ : and -. ` +
      'The same key replays the attempt it already opened; a new key opens a new attempt. ' +
      'Keys are scoped to the obligation, so a key spent before a shipping-fee correction is ' +
      'free again against the obligation that replaced it. Never stored in the clear and ' +
      'never echoed back.',
    schema: { type: 'string' },
  })
  @ApiBody({ type: InitiateFullPaymentAttemptBody })
  @ApiResponse({
    status: 201,
    description: 'The attempt this call opened, or a replay of an earlier identical one.',
    schema: envelopeSchemaOf(FullPaymentAttemptResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed body, or a missing or malformed Idempotency-Key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description:
      'REVERIFICATION_REQUIRED — the link is live, but no recent contact re-verification ' +
      'stands for this customer. Resolved by completing a STEP_UP verification and calling ' +
      'again; it is not a statement about the link.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request ' +
      'with no live obligation. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded, for a custom request rather than an ' +
      'order, for another order, the order’s shipping fee has not been set yet, or a fee ' +
      'correction superseded the obligation.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'FULL_PAYMENT_NOT_PAYABLE when the order is not currently collectable — it has been ' +
      'cancelled (which is where a lapsed stock reservation puts it), has moved past ' +
      'payment, or the obligation is already SATISFIED, so a settled payment cannot be ' +
      'reopened by a new attempt; DUPLICATE_OPERATION when another initiation with this key ' +
      'is still in flight; IDEMPOTENCY_CONFLICT when this key was already spent on a ' +
      'different initiation.',
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
    description:
      'FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE — secure-link resolution or the step-up policy ' +
      'is not usable. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async initiate(
    @Body() body: InitiateFullPaymentAttemptBody,
    @Req() request: NetworkReadableRequest & IdempotencyHeaderRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<FullPaymentAttemptHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = initiateFullPaymentAttemptSchema.parse(body);

    return this.guarded(async () => {
      const attemptKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);

      const admission: SecureLinkAdmission = await this.links.authorize(request, input.token);
      if (admission.outcome === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(admission.retryAfterSeconds));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const view = await this.attempts.initiate({ token: input.token, attemptKey });
      return {
        attemptId: view.attemptId,
        method: view.method,
        status: view.status,
        // Copied, never parsed. There is no `Number()` and no arithmetic in this
        // file — a `numeric(14,2)` that became a float here would be rounded on
        // the customer's payment screen.
        amount: view.amount,
        currencyCode: view.currencyCode,
        transferReference: view.transferReference,
        replayed: view.replayed,
      };
    });
  }

  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        throw toSecureLinkHttpException(error);
      }
      if (isFullPaymentError(error)) {
        throw toFullPaymentHttpException(error);
      }
      if (isAssetIntakeError(error)) {
        // Reachable only for `IDEMPOTENCY_KEY_INVALID`: `parseIdempotencyKey` is
        // the sole asset-domain function this surface calls, and it raises
        // nothing else. Reusing the delivered validator is what keeps the header
        // contract identical across every surface that accepts one.
        throw toIdempotencyKeyHttpException(error);
      }
      throw error;
    }
  }
}
