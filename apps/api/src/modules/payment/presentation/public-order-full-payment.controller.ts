/**
 * The two zero-write customer full-payment operations (`APP12-B04` §15, §17).
 *
 * ```text
 * POST /api/public/orders/full-payment     — publicOrderFullPayment_current
 * POST /api/public/orders/full-payment/qr  — publicOrderFullPayment_qr
 * ```
 *
 * ### A sibling of the deposit and balance surfaces, in every structural respect
 *
 * Same base path, same locator-free routes, same `POST`-for-a-read reason, same
 * binary QR contract, same three shared refusals, same split between the reads
 * and the one write. `APP7-B03`'s and `APP9-B02`'s reasoning is not restated
 * here at length because none of it changed; what follows is only what is
 * specific to a Ready-Made order.
 *
 * ### No locator, on either route
 *
 * There is no `/public/orders/{orderId}`, no obligation path and no attempt
 * path: the order is read from the `ORDER_ACCESS` grant row and the `FULL`
 * obligation from the order. A public route that took an order id would be an
 * enumeration oracle for other customers' orders — and unlike the custom
 * surfaces, a Ready-Made order id is one hop from the grant, so publishing it
 * would be handing out the only thing the walk needs.
 *
 * ### `POST`, and why both reads are one
 *
 * The credential is a bearer token, and `ADR-APP4-001` §11 makes the URL
 * fragment its only browser carrier — a query or path carrier is `FORBIDDEN`
 * with no fallback, because both are written to the Nginx access log, the
 * application request log, every proxy in between, and the `Referer` header of
 * any link the page later renders. So the token travels in a JSON body, which
 * makes both operations `POST` despite consuming nothing. `ADR-DB3-004` r2
 * keeps a link multi-use within its validity, so a customer refreshing their
 * payment page must not burn it.
 *
 * ### Wave 1
 *
 * Both are **released** operations (`APP12-G02`, extended by this checkpoint):
 * they must work with `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, because
 * Ready-Made *is* Wave 1. Their ids are in
 * `WAVE1_RELEASED_PUBLIC_OPERATIONS`, and the release-gate contract test fails
 * if either is moved or left unclassified. What stays withheld in Wave 1 is the
 * `REQUEST_ACCESS` scope, refused inside the resolver — not this operation.
 *
 * ### Two behavioural differences from the balance surface
 *
 * The obligation does not exist until an operator prices delivery (`BR-029`),
 * so before the fee there is nothing to read and the 404 below covers it — the
 * customer's *order* read is where "shipping is not priced yet" is stated
 * truthfully. And the read stays available afterwards while the QR does not:
 * `payable` is what distinguishes the two.
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
import { DeliverFullPaymentQr } from '../application/customer/deliver-full-payment-qr.query';
import { ReadFullPayment } from '../application/customer/read-full-payment.query';
import type { CustomerFullPaymentView } from '../application/customer/customer-full-payment.view';
import {
  FULL_PAYMENT_QR_CACHE_CONTROL,
  FULL_PAYMENT_QR_CONTENT_DISPOSITION,
  FULL_PAYMENT_QR_CONTENT_TYPE,
  FULL_PAYMENT_QR_CONTENT_TYPE_OPTIONS,
} from '../domain/full-payment/full-payment-qr.policy';
import {
  isFullPaymentError,
  toFullPaymentHttpException,
} from '../domain/full-payment/full-payment.errors';
import {
  FullPaymentQrBody,
  ReadFullPaymentBody,
  fullPaymentQrSchema,
  readFullPaymentSchema,
} from './schemas/public-order-full-payment.request';
import {
  CustomerFullPaymentResponse,
  FullPaymentBankInstructionsResponse,
  type CustomerFullPaymentHttpView,
} from './schemas/public-order-full-payment.response';

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
      'with no readable payment. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded, for a custom request rather than an ' +
      'order, for another order, or the order has no live payment obligation — which ' +
      'includes an order whose shipping fee has not been set yet and one whose obligation a ' +
      'fee correction superseded. The custom deposit and balance are never substituted.',
    schema: ERROR_SCHEMA,
  },
  rateLimited: {
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  },
} as const;

@ApiTags('publicOrderFullPayment')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(CustomerFullPaymentResponse, FullPaymentBankInstructionsResponse)
@Controller('public/orders')
export class PublicOrderFullPaymentController {
  constructor(
    private readonly fullPayments: ReadFullPayment,
    private readonly qrImages: DeliverFullPaymentQr,
  ) {}

  @Post('full-payment')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('FULL_PAYMENT_READ', 'Order payment read.')
  @ApiOperation({
    summary: 'Read the payment owed on the Ready-Made order a secure link opens',
    description:
      'Returns what is owed on the one Ready-Made order the presented secure link grants ' +
      'access to. The order comes from the grant, so there is no order id, obligation id, ' +
      'attempt id, amount or customer identifier in the body. The amount is the live ' +
      'obligation’s own frozen figure — the merchandise subtotal the order froze at ' +
      'creation plus the exact shipping fee an operator set — and nothing is recomputed on ' +
      'read: no price is looked up, no fee is added to a subtotal and no deposit is ' +
      'subtracted, because a Ready-Made order has none. After a shipping-fee correction this ' +
      'returns the successor obligation’s amount, because only the live one is ever read. ' +
      'The transfer reference is derived from the order code with the FL suffix, so it is ' +
      'identical on every read and distinct from the custom deposit and balance memos. This ' +
      'read stays available after the payment window closes, so a customer whose transfer an ' +
      'Admin has verified can see that; `payable` is what distinguishes the two. Reading ' +
      'writes nothing: no attempt is opened, no state moves and the link is not consumed. ' +
      'Every token that does not open a live order grant, and every order with no live ' +
      'obligation — including one whose shipping fee is still unpriced — answer with one ' +
      'identical 404.',
  })
  @ApiBody({ type: ReadFullPaymentBody })
  @ApiResponse({
    status: 200,
    description: 'The payment this link opens, projected for its customer.',
    schema: envelopeSchemaOf(CustomerFullPaymentResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE — secure-link resolution or the merchant bank ' +
      'configuration is not usable. It names no variable and no value.',
    schema: ERROR_SCHEMA,
  })
  async current(
    @Body() body: ReadFullPaymentBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomerFullPaymentHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readFullPaymentSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.fullPayments.read(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }
      return toHttpView(outcome.view);
    });
  }

  @Post('full-payment/qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Download the bank-transfer QR for the Ready-Made order a secure link opens',
    description:
      'Streams a PNG QR encoding the bank transfer for the order: the merchant’s bank and ' +
      'account, the live obligation’s exact amount and the derived FL transfer reference. It ' +
      'is an EMVCo/NAPAS account-transfer payload — a banking application reads it and ' +
      'pre-fills the transfer — and it is not a checkout session: it contains no application ' +
      'URL, no secure-link token, no attempt id and no provider reference. The image is ' +
      'generated locally on the server on every request from the obligation that is live at ' +
      'that moment and is never stored, so after a shipping-fee correction the next download ' +
      'carries the corrected amount with no cache to invalidate. Requesting it changes no ' +
      'payment state whatsoever. Unlike the read, it is refused unless the order is ' +
      'currently payable, because a QR is an instruction to send money and one served for a ' +
      'cancelled or already-verified order would invite a transfer nobody owes.',
  })
  @ApiBody({ type: FullPaymentQrBody })
  @ApiProduces(FULL_PAYMENT_QR_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The transfer QR, as a downloadable PNG.',
    content: {
      [FULL_PAYMENT_QR_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } },
    },
    headers: {
      'Cache-Control': {
        description:
          'Always `no-store`. The bytes are stable only while the obligation is, and the ' +
          'link authorising them is not.',
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
      'FULL_PAYMENT_NOT_PAYABLE — the order has been cancelled (which is where a lapsed ' +
      'stock reservation puts it), has already moved past payment, or the obligation is ' +
      'already SATISFIED. One code for every case, so the response does not disclose the ' +
      'order’s internal state; the read carries both states honestly for a caller entitled ' +
      'to them.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE — the merchant bank configuration or the QR ' +
      'encoder could not produce a payload. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async qr(
    @Body() body: FullPaymentQrBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const input = fullPaymentQrSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.qrImages.render(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }

      response.setHeader('Cache-Control', FULL_PAYMENT_QR_CACHE_CONTROL);
      response.setHeader('X-Content-Type-Options', FULL_PAYMENT_QR_CONTENT_TYPE_OPTIONS);

      return new StreamableFile(outcome.png, {
        type: FULL_PAYMENT_QR_CONTENT_TYPE,
        // A fixed name: an order code or a reference in the filename would put a
        // payment fact into a shared Downloads folder.
        disposition: FULL_PAYMENT_QR_CONTENT_DISPOSITION,
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
      if (isFullPaymentError(error)) {
        throw toFullPaymentHttpException(error);
      }
      throw error;
    }
  }
}

function toHttpView(view: CustomerFullPaymentView): CustomerFullPaymentHttpView {
  return {
    orderCode: view.orderCode,
    orderStatus: view.orderStatus,
    fullPaymentStatus: view.fullPaymentStatus,
    // Copied, never parsed. There is no `Number()` and no arithmetic in this
    // file — a `numeric(14,2)` that became a float here would be rounded on the
    // customer's payment screen.
    fullPaymentAmount: view.fullPaymentAmount,
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
