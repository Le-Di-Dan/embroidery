/**
 * The two zero-write customer final-payment operations (`APP9-B02`).
 *
 * ```text
 * POST /api/public/orders/final-payment     — publicOrderFinalPayment_current
 * POST /api/public/orders/final-payment/qr  — publicOrderFinalPayment_qr
 * ```
 *
 * ### A sibling of the deposit surface, in every structural respect
 *
 * Same base path, same locator-free routes, same `POST`-for-a-read reason, same
 * binary QR contract, same three shared refusals, same split between the reads
 * and the one write. `APP7-B03`'s reasoning is not restated here at length
 * because none of it changed; what follows is only what is specific to the
 * balance.
 *
 * ### No locator, on either route
 *
 * There is no `/public/orders/{orderId}`, no obligation path and no attempt
 * path: the order is read from the grant row, the `REMAINING` obligation from
 * the order, and the QR from the obligation. A public route that took an order
 * id would be an enumeration oracle for other customers' orders.
 *
 * ### `POST`, and why both reads are one
 *
 * The credential is a bearer token, and `ADR-APP4-001` §11 makes the URL
 * fragment its only browser carrier — a query or path carrier is `FORBIDDEN`
 * with no fallback, because both are written to the Nginx access log, the
 * application request log, every proxy in between, and the `Referer` header of
 * any link the page later renders. So the token travels in a JSON body, which
 * makes both operations `POST` despite consuming nothing. `ADR-DB3-004` r2 keeps
 * a link multi-use within its validity, so a customer refreshing their payment
 * page must not burn it.
 *
 * ### The one behavioural difference from the deposit
 *
 * The read is always available; the QR is not. `REMAINING` exists from order
 * creation but becomes payable only at `TR-LC14-05`, so the QR — an instruction
 * to send money — refuses outside that window with
 * `FINAL_PAYMENT_NOT_PAYABLE`, while the read answers honestly and says
 * `payable: false`.
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
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

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
import { DeliverFinalPaymentQr } from '../application/customer/deliver-final-payment-qr.query';
import { ReadFinalPayment } from '../application/customer/read-final-payment.query';
import type { CustomerFinalPaymentView } from '../application/customer/customer-final-payment.view';
import {
  FINAL_PAYMENT_QR_CACHE_CONTROL,
  FINAL_PAYMENT_QR_CONTENT_DISPOSITION,
  FINAL_PAYMENT_QR_CONTENT_TYPE,
  FINAL_PAYMENT_QR_CONTENT_TYPE_OPTIONS,
} from '../domain/final-payment/final-payment-qr.policy';
import {
  isFinalPaymentError,
  toFinalPaymentHttpException,
} from '../domain/final-payment/final-payment.errors';
import {
  FinalPaymentQrBody,
  ReadFinalPaymentBody,
  finalPaymentQrSchema,
  readFinalPaymentSchema,
} from './schemas/public-order-final-payment.request';
import {
  CustomerFinalPaymentResponse,
  FinalPaymentBankInstructionsResponse,
  type CustomerFinalPaymentHttpView,
} from './schemas/public-order-final-payment.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

const SHARED_REFUSALS = {
  badRequest: { status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA },
  notFound: {
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request ' +
      'with no readable final payment. Identical in status, code, message and shape whether ' +
      'the token is unknown, expired, revoked, superseded, for another target, the order has ' +
      'not been created, or the order has no live REMAINING obligation — including one that ' +
      'a shipping-fee change superseded. The deposit is never substituted for it.',
    schema: ERROR_SCHEMA,
  },
  rateLimited: {
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  },
} as const;

@ApiTags('publicOrderFinalPayment')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(CustomerFinalPaymentResponse, FinalPaymentBankInstructionsResponse)
@Controller('public/orders')
export class PublicOrderFinalPaymentController {
  constructor(
    private readonly finalPayments: ReadFinalPayment,
    private readonly qrImages: DeliverFinalPaymentQr,
  ) {}

  @Post('final-payment')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('FINAL_PAYMENT_READ', 'Final payment read.')
  @ApiOperation({
    summary: 'Read the final payment a secure link opens',
    description:
      'Returns what is owed on the remaining balance of the one order belonging to the ' +
      'custom request the presented secure link grants access to. The request comes from the ' +
      'grant and the order from the request, so there is no order id, obligation id, attempt ' +
      'id, amount or customer identifier in the body. The amount is the REMAINING ' +
      'obligation’s own frozen figure, copied from the accepted quotation at order creation ' +
      '— no total minus deposit is recomputed and no quotation is read — and the currency is ' +
      'the obligation’s own VND. The bank instructions are server-owned configuration, and ' +
      'the transfer reference is derived from the order code with the RM suffix, so it is ' +
      'identical on every read and distinct from the deposit memo. The deposit is neither ' +
      'shown nor payable here. This read stays available after the payment window closes, so ' +
      'a customer whose balance an Admin has verified can see that; `payable` is what ' +
      'distinguishes the two. Reading writes nothing: no attempt is opened, no state moves ' +
      'and the link is not consumed. Every token that does not open a live grant, and every ' +
      'request with no live REMAINING obligation, answer with one identical 404.',
  })
  @ApiBody({ type: ReadFinalPaymentBody })
  @ApiResponse({
    status: 200,
    description: 'The final payment this link opens, projected for its customer.',
    schema: envelopeSchemaOf(CustomerFinalPaymentResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE — secure-link resolution or the merchant bank ' +
      'configuration is not usable. It names no variable and no value.',
    schema: ERROR_SCHEMA,
  })
  async current(
    @Body() body: ReadFinalPaymentBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomerFinalPaymentHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readFinalPaymentSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.finalPayments.read(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }
      return toHttpView(outcome.view);
    });
  }

  @Post('final-payment/qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Download the bank-transfer QR for the final payment a secure link opens',
    description:
      'Streams a PNG QR encoding the bank transfer for the remaining balance: the merchant’s ' +
      'bank and account, the REMAINING obligation’s exact amount and the derived RM transfer ' +
      'reference. It is an EMVCo/NAPAS account-transfer payload — a banking application reads ' +
      'it and pre-fills the transfer — and it is not a checkout session: it contains no ' +
      'application URL, no secure-link token, no attempt id and no provider reference. The ' +
      'image is generated locally on the server on every request from immutable inputs and is ' +
      'never stored, so no object, asset or storage key exists for it. Requesting it changes ' +
      'no payment state whatsoever. Unlike the read, it is refused unless the balance is ' +
      'currently payable, because a QR is an instruction to send money and one served outside ' +
      'that window would invite a transfer nobody owes. The same 404 as the final-payment ' +
      'read answers every unusable token and every order with no live REMAINING obligation.',
  })
  @ApiBody({ type: FinalPaymentQrBody })
  @ApiProduces(FINAL_PAYMENT_QR_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The transfer QR, as a downloadable PNG.',
    content: {
      [FINAL_PAYMENT_QR_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } },
    },
    headers: {
      'Cache-Control': {
        description:
          'Always `no-store`. The bytes are stable but the link authorising them is not.',
        schema: { type: 'string' },
      },
      'Content-Disposition': {
        description: 'Always `attachment` with a fixed filename naming no order fact.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse({
    status: 409,
    description:
      'FINAL_PAYMENT_NOT_PAYABLE — the order has not reached AWAITING_FINAL_PAYMENT, is on ' +
      'hold, has already moved past it, or the balance is already SATISFIED. One code for ' +
      'both halves, so the response does not disclose the order’s internal state; the read ' +
      'carries both states honestly for a caller entitled to them.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE — the merchant bank configuration or the QR ' +
      'encoder could not produce a payload. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async qr(
    @Body() body: FinalPaymentQrBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const input = finalPaymentQrSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.qrImages.render(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }

      response.setHeader('Cache-Control', FINAL_PAYMENT_QR_CACHE_CONTROL);
      response.setHeader('X-Content-Type-Options', FINAL_PAYMENT_QR_CONTENT_TYPE_OPTIONS);

      return new StreamableFile(outcome.png, {
        type: FINAL_PAYMENT_QR_CONTENT_TYPE,
        // A fixed name: an order code or a reference in the filename would put a
        // payment fact into a shared Downloads folder.
        disposition: FINAL_PAYMENT_QR_CONTENT_DISPOSITION,
        length: outcome.png.byteLength,
      });
    });
  }

  private rateLimited(response: HeaderSettableResponse, retryAfterSeconds: number): HttpException {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    return new HttpException(
      { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        throw toSecureLinkHttpException(error);
      }
      if (isFinalPaymentError(error)) {
        throw toFinalPaymentHttpException(error);
      }
      throw error;
    }
  }
}

function toHttpView(view: CustomerFinalPaymentView): CustomerFinalPaymentHttpView {
  return {
    orderCode: view.orderCode,
    orderStatus: view.orderStatus,
    finalPaymentStatus: view.finalPaymentStatus,
    // Copied, never parsed. There is no `Number()` and no arithmetic in this
    // file — a `numeric(14,2)` that became a float here would be rounded on the
    // customer's payment screen.
    finalPaymentAmount: view.finalPaymentAmount,
    currencyCode: view.currencyCode,
    payable: view.payable,
    bankInstructions: {
      bankBin: view.bankInstructions.bankBin,
      bankDisplayName: view.bankInstructions.bankDisplayName,
      accountNumber: view.bankInstructions.accountNumber,
      accountName: view.bankInstructions.accountName,
      transferReference: view.bankInstructions.transferReference,
    },
    accessExpiresAt: view.accessExpiresAt.toISOString(),
  };
}
