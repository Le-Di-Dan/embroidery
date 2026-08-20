/**
 * The one grant-scoped customer quotation read (`APP6-B04`).
 *
 * ```text
 * POST /api/public/quotations/current — publicQuotation_current
 * ```
 *
 * ### One operation, and no locator in it
 *
 * There is exactly one handler on this class and it addresses no collection and
 * no identified resource. `current` is not a quotation id: the request the link
 * opens is read from the grant row, and the quotation is reached from that
 * request's own `current_quotation_id` pointer. There is no
 * `/public/quotations/{id}`, no quotation history read and no second "resolve
 * quotation" endpoint, because a public route that took an id would be an
 * enumeration oracle for other customers' prices.
 *
 * ### POST, and the reason it is not a GET
 *
 * The credential is a bearer token. A `GET` would have to carry it in a path
 * segment or query string, and both are written to the Nginx access log, the
 * application request log, every proxy in between, and the `Referer` header of
 * any link the page later renders. `ADR-APP4-001` §11 makes the URL fragment the
 * only browser carrier and declares a query or path carrier `FORBIDDEN` with no
 * fallback. The operation is idempotent and consumes nothing despite the verb —
 * ADR-DB3-004 r2 keeps a link multi-use within its validity, so a customer
 * refreshing their quotation page must not burn it.
 *
 * ### A separate class from the three Admin quotation controllers
 *
 * They publish `adminQuotation` behind the APP1 guards; this publishes
 * `publicQuotation` behind a secure-link token and nothing else. The split is a
 * dependency-shape decision as much as a contract one — `customer-quotation.module.ts`
 * records what this surface may inject — and because the class name derives its
 * own domain key, no `CONTROLLER_DOMAIN_KEYS` entry is needed and the five
 * accepted Admin operation ids are untouched.
 *
 * ### Every definitive failure looks the same
 *
 * Unknown token, expired, revoked, superseded, wrong scope, a request with no
 * quotation yet, an unset version pointer, a quotation or version that does not
 * belong to the grant's request — all arrive here as one `SecureLinkError` and
 * leave as one `404 / SECURE_LINK_UNAVAILABLE`. This class contains no branch on
 * a cause, because it is never told one, and it publishes no
 * `QUOTATION_NOT_FOUND` for the same reason. An expired *quotation* is not one
 * of those cases: it is a successful `200` carrying `expired: true`.
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
import {
  ReadCurrentQuotation,
  type CurrentQuotationOutcome,
} from '../application/customer/read-current-quotation.query';
import type { CustomerQuotationView } from '../application/customer/customer-quotation.view';
import {
  ReadCurrentQuotationBody,
  readCurrentQuotationSchema,
} from './schemas/public-quotation.request';
import {
  CustomerQuotationLineItemResponse,
  CustomerQuotationResponse,
  type CustomerQuotationHttpView,
} from './schemas/public-quotation.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicQuotation')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(CustomerQuotationResponse, CustomerQuotationLineItemResponse)
@Controller('public/quotations')
export class PublicQuotationController {
  constructor(private readonly quotations: ReadCurrentQuotation) {}

  @Post('current')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('CURRENT_QUOTATION_READ', 'Current quotation read.')
  @ApiOperation({
    summary: 'Read the quotation a secure link opens',
    description:
      'Returns the quotation version that is current for the one custom request the presented ' +
      'secure link grants access to. The request is identified by the grant, and the version ' +
      'by the request’s and the quotation’s own current pointers — never by the caller: there ' +
      'is no quotation id, version id, request id or customer identifier in the body. A newer ' +
      'sent version makes a later call return that newer version; a superseded one is never ' +
      'served as current. A quotation whose validity has lapsed is still returned in full, ' +
      'flagged `expired`, and is not written to. Every token that does not open a live grant, ' +
      'and every request with no current quotation, answer with one identical 404.',
  })
  @ApiBody({ type: ReadCurrentQuotationBody })
  @ApiResponse({
    status: 200,
    description: 'The quotation this link opens, projected for its customer.',
    schema: envelopeSchemaOf(CustomerQuotationResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request ' +
      'with no readable current quotation. Identical in status, code, message and shape ' +
      'whether the token is unknown, expired, revoked, superseded, for another target, or the ' +
      'request has simply not been quoted yet.',
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
    @Body() body: ReadCurrentQuotationBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomerQuotationHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readCurrentQuotationSchema.parse(body);

    try {
      const outcome: CurrentQuotationOutcome = await this.quotations.read(request, {
        token: input.token,
      });
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
 * The one projection.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later: adding an internal field upstream
 * cannot leak through this function without an edit here.
 *
 * Amounts are copied, never parsed. There is no `Number()` and no arithmetic in
 * this file — a `numeric(14,2)` that became a float here would be rounded on the
 * customer's screen.
 */
function toHttpView(view: CustomerQuotationView): CustomerQuotationHttpView {
  return {
    quotationCode: view.quotationCode,
    versionId: view.versionId,
    version: view.version,
    status: view.status,
    quotationStatus: view.quotationStatus,
    currencyCode: view.currencyCode,
    quantityTotal: view.quantityTotal,
    subtotalAmount: view.subtotalAmount,
    manualAdjustmentAmount: view.manualAdjustmentAmount,
    shippingFeeAmount: view.shippingFeeAmount,
    totalAmount: view.totalAmount,
    depositPercent: view.depositPercent,
    depositAmount: view.depositAmount,
    remainingAmount: view.remainingAmount,
    lineItems: view.lineItems.map((line) => ({
      position: line.position,
      lineKind: line.lineKind,
      description: line.description,
      quantity: line.quantity,
      unitPriceAmount: line.unitPriceAmount,
      lineTotalAmount: line.lineTotalAmount,
    })),
    sentAt: view.sentAt?.toISOString() ?? null,
    validFrom: view.validFrom?.toISOString() ?? null,
    validUntil: view.validUntil?.toISOString() ?? null,
    expired: view.expired,
    accessExpiresAt: view.accessExpiresAt.toISOString(),
  };
}
