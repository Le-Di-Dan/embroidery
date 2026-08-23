/**
 * The two zero-write customer deposit operations (`APP7-B03`).
 *
 * ```text
 * POST /api/public/orders/deposit     — publicOrderDeposit_current
 * POST /api/public/orders/deposit/qr  — publicOrderDeposit_qr
 * ```
 *
 * ### No locator, on either route
 *
 * Neither handler addresses a collection or an identified resource. There is no
 * `/public/orders/{orderId}`, no obligation path and no attempt path: the order
 * is read from the grant row, the DEPOSIT obligation from the order, and the QR
 * from the obligation. A public route that took an order id would be an
 * enumeration oracle for other customers' orders, which is the same reason
 * `APP6-B04` publishes `/public/quotations/current` and no id route.
 *
 * ### POST, and the reason both are POST
 *
 * The credential is a bearer token. `ADR-APP4-001` §11 makes the URL fragment
 * the only browser carrier and declares a query or path carrier `FORBIDDEN` with
 * no fallback, because both are written to the Nginx access log, the application
 * request log, every proxy in between, and the `Referer` header of any link the
 * page later renders. Both operations are idempotent and consume nothing despite
 * the verb — ADR-DB3-004 r2 keeps a link multi-use within its validity, so a
 * customer refreshing their payment page must not burn it.
 *
 * That reasoning applies unchanged to the binary route. A `GET …/qr` would have
 * to carry the token somewhere loggable, so the QR is a `POST` that returns
 * `image/png`. The customer still downloads the bytes: the response carries
 * `Content-Disposition: attachment` and a fixed safe filename.
 *
 * ### A separate class from the initiation controller
 *
 * `PublicOrderDepositAttemptController` owns the one write. The split exists for
 * the reason `PublicQuotationController` and `PublicQuotationDecisionController`
 * are split: **this module holds no transaction manager and no idempotency
 * store**, so no route on it can open an attempt, and a write that needed one
 * could not be added without changing `customer-deposit.module.ts`.
 * `CONTROLLER_DOMAIN_KEYS` maps both classes onto `publicOrderDeposit`, so the
 * file-layout decision names no public identifier.
 *
 * ### Every definitive failure looks the same
 *
 * Unknown token, expired, revoked, superseded, wrong scope, a request with no
 * order, an order with no live DEPOSIT obligation — all arrive here as one
 * `SecureLinkError` and leave as one `404 / SECURE_LINK_UNAVAILABLE`. This class
 * contains no branch on a cause, because it is never told one. A satisfied
 * deposit is not one of those cases: it is a successful `200` carrying
 * `depositStatus: SATISFIED`.
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
import { DeliverDepositQr } from '../application/customer/deliver-deposit-qr.query';
import { ReadDeposit } from '../application/customer/read-deposit.query';
import type { CustomerDepositView } from '../application/customer/customer-deposit.view';
import {
  DEPOSIT_QR_CACHE_CONTROL,
  DEPOSIT_QR_CONTENT_DISPOSITION,
  DEPOSIT_QR_CONTENT_TYPE,
  DEPOSIT_QR_CONTENT_TYPE_OPTIONS,
} from '../domain/deposit/deposit-qr.policy';
import { isDepositError, toDepositHttpException } from '../domain/deposit/deposit.errors';
import {
  DepositQrBody,
  ReadDepositBody,
  depositQrSchema,
  readDepositSchema,
} from './schemas/public-order-deposit.request';
import {
  CustomerDepositResponse,
  DepositBankInstructionsResponse,
  type CustomerDepositHttpView,
} from './schemas/public-order-deposit.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

/** The refusals both routes publish identically. Declared once. */
const SHARED_REFUSALS = {
  badRequest: { status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA },
  notFound: {
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request ' +
      'with no readable deposit. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded, for another target, or the order has ' +
      'simply not been created yet.',
    schema: ERROR_SCHEMA,
  },
  rateLimited: {
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  },
} as const;

@ApiTags('publicOrderDeposit')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(CustomerDepositResponse, DepositBankInstructionsResponse)
@Controller('public/orders')
export class PublicOrderDepositController {
  constructor(
    private readonly deposits: ReadDeposit,
    private readonly qrImages: DeliverDepositQr,
  ) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DEPOSIT_READ', 'Deposit read.')
  @ApiOperation({
    summary: 'Read the deposit a secure link opens',
    description:
      'Returns what is owed on the deposit of the one order belonging to the custom request ' +
      'the presented secure link grants access to. The request comes from the grant and the ' +
      'order from the request, so there is no order id, obligation id, attempt id, amount or ' +
      'customer identifier in the body. The amount is the DEPOSIT obligation’s own frozen ' +
      'figure — no share of a total is recomputed and no quotation is read — and the currency ' +
      'is the obligation’s own VND. The bank instructions are server-owned configuration, and ' +
      'the transfer reference is derived from the order code, so it is identical on every ' +
      'read. The remaining payment is neither shown nor payable here. Reading writes nothing: ' +
      'no attempt is opened, no state moves and the link is not consumed. Every token that ' +
      'does not open a live grant, and every request with no deposit to read, answer with one ' +
      'identical 404.',
  })
  @ApiBody({ type: ReadDepositBody })
  @ApiResponse({
    status: 200,
    description: 'The deposit this link opens, projected for its customer.',
    schema: envelopeSchemaOf(CustomerDepositResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'DEPOSIT_INSTRUCTIONS_UNAVAILABLE — secure-link resolution or the merchant bank ' +
      'configuration is not usable. It names no variable and no value.',
    schema: ERROR_SCHEMA,
  })
  async current(
    @Body() body: ReadDepositBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomerDepositHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readDepositSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.deposits.read(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }
      return toHttpView(outcome.view);
    });
  }

  @Post('deposit/qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Download the bank-transfer QR for the deposit a secure link opens',
    description:
      'Streams a PNG QR encoding the bank transfer for this deposit: the merchant’s bank and ' +
      'account, the DEPOSIT obligation’s exact amount and the derived transfer reference. It ' +
      'is an EMVCo/NAPAS account-transfer payload — a banking application reads it and ' +
      'pre-fills the transfer — and it is not a checkout session: it contains no application ' +
      'URL, no secure-link token, no attempt id and no provider reference. The image is ' +
      'generated locally on the server on every request from immutable inputs and is never ' +
      'stored, so no object, asset or storage key exists for it. Requesting it changes no ' +
      'payment state whatsoever. The same 404 as the deposit read answers every unusable ' +
      'token and every order with no deposit.',
  })
  @ApiBody({ type: DepositQrBody })
  @ApiProduces(DEPOSIT_QR_CONTENT_TYPE)
  @ApiResponse({
    status: 200,
    description: 'The transfer QR, as a downloadable PNG.',
    content: { [DEPOSIT_QR_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
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
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse({
    status: 503,
    description:
      'DEPOSIT_INSTRUCTIONS_UNAVAILABLE — the merchant bank configuration or the QR encoder ' +
      'could not produce a payload. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async qr(
    @Body() body: DepositQrBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const input = depositQrSchema.parse(body);

    return this.guarded(async () => {
      const outcome = await this.qrImages.render(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        throw this.rateLimited(response, outcome.retryAfterSeconds);
      }

      response.setHeader('Cache-Control', DEPOSIT_QR_CACHE_CONTROL);
      response.setHeader('X-Content-Type-Options', DEPOSIT_QR_CONTENT_TYPE_OPTIONS);

      return new StreamableFile(outcome.png, {
        type: DEPOSIT_QR_CONTENT_TYPE,
        // A fixed name: an order code or a reference in the filename would put a
        // payment fact into a shared Downloads folder.
        disposition: DEPOSIT_QR_CONTENT_DISPOSITION,
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

  /**
   * Runs one operation, translating this surface's two refusal families.
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
      throw error;
    }
  }
}

/**
 * The one projection.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later: adding an internal field upstream
 * cannot leak through this function without an edit here.
 *
 * Amounts are copied, never parsed. There is no `Number()` and no arithmetic in
 * this file — a `numeric(14,2)` that became a float here would be rounded on the
 * customer's payment screen.
 */
function toHttpView(view: CustomerDepositView): CustomerDepositHttpView {
  return {
    orderCode: view.orderCode,
    orderStatus: view.orderStatus,
    depositStatus: view.depositStatus,
    depositAmount: view.depositAmount,
    currencyCode: view.currencyCode,
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
