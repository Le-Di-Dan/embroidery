/**
 * The one customer deposit write (`APP7-B03`).
 *
 * ```text
 * POST /api/public/orders/deposit/attempts — publicOrderDeposit_initiate
 * ```
 *
 * ### A second class, and the same published domain
 *
 * `PublicOrderDepositController` keeps `publicOrderDeposit_current` and
 * `publicOrderDeposit_qr`. The split renames nothing:
 * `CONTROLLER_DOMAIN_KEYS` maps this class onto `publicOrderDeposit`, so the
 * three operations read `_current`, `_qr` and `_initiate`. Without that entry
 * this would mint `publicOrderDepositAttempt_initiate`, letting a file-layout
 * decision name a public identifier.
 *
 * The split exists for the reason `PublicQuotationController` and
 * `PublicQuotationDecisionController` are split: **the read module holds no
 * transaction manager, no idempotency store and no payment repository**, so no
 * route on it can open an attempt. `customer-deposit.module.ts` documents that
 * absence as its security boundary; merging the write into it would delete the
 * property for the deposit read and the QR as well.
 *
 * ### One operation, no second
 *
 * There is no attempt list, no attempt detail, no "mark paid", no customer
 * confirmation, no retry mutation, no evidence route and no provider route.
 * `APP7-B03` §3 names every one of those as out of scope, and several are
 * defects rather than omissions: a customer-facing "mark paid" would let a
 * browser assert a payment fact only Admin verification can establish, and a
 * retry *mutation* would contradict LC-16, under which a retry is a new attempt
 * and a terminal attempt is never reset.
 *
 * ### The attempt key is a header
 *
 * `Idempotency-Key`, validated by the delivered `parseIdempotencyKey` — the same
 * transport and the same rules as the three shipped intake lanes. Repeating a
 * request with the same key replays the attempt it already opened; a deliberate
 * retry sends a new key and opens a new attempt, for as long as the obligation
 * is still awaiting payment.
 *
 * ### Which failures look the same, and which do not
 *
 * Every unusable token and every unreachable deposit arrives as one
 * `SecureLinkError` and leaves as one `404 / SECURE_LINK_UNAVAILABLE`, identical
 * to the read's. `REVERIFICATION_REQUIRED`, `DEPOSIT_NOT_PAYABLE`,
 * `DUPLICATE_OPERATION` and `IDEMPOTENCY_CONFLICT` are deliberately **not**
 * folded into it: each is only reachable after the caller has proved possession
 * of a live grant for this request, so none discloses anything a probe did not
 * already hold — and collapsing them would leave the customer's screen with no
 * way to tell "confirm your contact again" from "this deposit is already
 * settled" from "your payment is already starting".
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
import { InitiateDepositAttemptUseCase } from '../application/customer/initiate-deposit-attempt.use-case';
import { isDepositError, toDepositHttpException } from '../domain/deposit/deposit.errors';
import {
  InitiateDepositAttemptBody,
  initiateDepositAttemptSchema,
} from './schemas/public-order-deposit.request';
import {
  DepositAttemptResponse,
  type DepositAttemptHttpView,
} from './schemas/public-order-deposit.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

/** The headers a request carries, read structurally rather than by HTTP type. */
interface IdempotencyHeaderRequest {
  readonly headers: Record<string, unknown>;
}

@ApiTags('publicOrderDeposit')
@ApiExtraModels(DepositAttemptResponse)
@Controller('public/orders')
export class PublicOrderDepositAttemptController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly attempts: InitiateDepositAttemptUseCase,
  ) {}

  @Post('deposit/attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('DEPOSIT_ATTEMPT_OPENED', 'Deposit payment attempt opened.')
  @ApiOperation({
    summary: 'Open one bank-transfer attempt against the deposit a secure link opens',
    description:
      'Records that the customer is about to transfer the deposit. The order, the DEPOSIT ' +
      'obligation, the amount, the currency and the step-up evidence are all resolved by the ' +
      'server from the grant — none of them is accepted from the caller. Inside one ' +
      'transaction the grant is re-checked under its row lock, the obligation must still be ' +
      'awaiting payment, a recent re-verification of the customer’s own contact is required, ' +
      'and one BANK_TRANSFER attempt is created at PENDING for the obligation’s exact amount. ' +
      'This is **not** a payment: no attempt is settled, no obligation is satisfied, no order ' +
      'becomes DEPOSIT_PAID and no reconciliation is written — only an Admin verifying that ' +
      'the money arrived can do any of that. Repeating the call with the same Idempotency-Key ' +
      'replays the same attempt and creates no second one; a deliberate retry sends a new key.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      `The caller’s own key for this attempt, ${String(MIN_IDEMPOTENCY_KEY_LENGTH)}–` +
      `${String(MAX_IDEMPOTENCY_KEY_LENGTH)} characters from A–Z a–z 0–9 . _ : and -. ` +
      'The same key replays the attempt it already opened; a new key opens a new attempt. ' +
      'Never stored in the clear and never echoed back.',
    schema: { type: 'string' },
  })
  @ApiBody({ type: InitiateDepositAttemptBody })
  @ApiResponse({
    status: 201,
    description: 'The attempt this call opened, or a replay of an earlier identical one.',
    schema: envelopeSchemaOf(DepositAttemptResponse),
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
      'with no payable deposit. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded, for another target, or the order has ' +
      'not been created.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'DEPOSIT_NOT_PAYABLE when the deposit is no longer awaiting payment — it has been ' +
      'verified, or the obligation was cancelled; DUPLICATE_OPERATION when another ' +
      'initiation with this key is still in flight; IDEMPOTENCY_CONFLICT when this key was ' +
      'already spent on a different initiation.',
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
      'DEPOSIT_INSTRUCTIONS_UNAVAILABLE — secure-link resolution or the step-up policy is not ' +
      'usable. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async initiate(
    @Body() body: InitiateDepositAttemptBody,
    @Req() request: NetworkReadableRequest & IdempotencyHeaderRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<DepositAttemptHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = initiateDepositAttemptSchema.parse(body);

    return this.guarded(async () => {
      const attemptKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);

      // The delivered public admission, run before the transaction opens — the
      // same fail-closed policy read, abuse budget and digest the deposit read
      // uses, so a caller cannot escape `secure_link.resolve`'s budget by
      // spreading token guesses across the read, the QR and this write. It is
      // **not** the authorization the write acts on: the use case re-establishes
      // the grant inside its own transaction under its row lock
      // (ADR-DB3-004 r9), which is what makes a concurrent revoke win.
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

  /**
   * Runs the initiation, translating this surface's three refusal families.
   *
   * Anything else propagates to the platform filter, which sanitises it.
   * Catching more broadly here is how a `PersistenceError` — whose diagnostics
   * name a constraint and can quote a column — would be shaped into a response
   * by this file, and how a database fault would become a token-validity signal.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        throw toSecureLinkHttpException(error);
      }
      if (isDepositError(error)) {
        throw toDepositHttpException(error);
      }
      if (isAssetIntakeError(error)) {
        // Reachable only for `IDEMPOTENCY_KEY_INVALID`: `parseIdempotencyKey` is
        // the sole asset-domain function this surface calls, and it raises
        // nothing else. Reusing the delivered validator is what keeps the header
        // contract identical across the four surfaces that accept one.
        throw toIdempotencyKeyHttpException(error);
      }
      throw error;
    }
  }
}
