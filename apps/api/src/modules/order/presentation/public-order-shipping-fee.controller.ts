/**
 * The customer shipping-fee acknowledgement (`APP9-B04-C1`).
 *
 * ```text
 * POST /api/public/orders/shipping-fee-acknowledgements
 *   -> publicOrderShippingFee_acknowledge
 * ```
 *
 * One operation, and the third and last of `APP9-B04`. The class name derives
 * its published domain key, so no `CONTROLLER_DOMAIN_KEYS` entry is owed and no
 * accepted identifier is reissued.
 *
 * ### Why a customer route at all, when Admin owns shipping
 *
 * It does not edit shipping. `WHO_EDITS_BEFORE_FREEZE = ADMIN` is untouched:
 * there is no recipient, address, carrier, tracking or shipping-state field
 * anywhere on this surface, and the module behind it cannot reach
 * `saveShippingDetails` at all. What this records is the customer's *decision*
 * about one price — which ADR-DB3-004 and DEV-DB6-014 make customer evidence,
 * and which therefore cannot be written by the operator who benefits from it.
 *
 * ### POST, and the body carrier
 *
 * The credential is a bearer token. `ADR-APP4-001` §11 makes the URL fragment
 * the only browser carrier and declares a query or path carrier `FORBIDDEN` with
 * no fallback, because both are written to the Nginx access log, the application
 * request log, every proxy in between, and the `Referer` of any link the page
 * later renders. The call also genuinely writes, so the verb is honest as well
 * as necessary. The collection path carries no identifier for the same reason:
 * a public route taking an order id would be an enumeration oracle.
 *
 * ### Which failures look the same, and which do not
 *
 * Every unusable token — unknown, expired, revoked, superseded, wrong scope —
 * and every unreachable target — no order for this request — arrives as one
 * `SecureLinkError` and leaves as one `404 / SECURE_LINK_UNAVAILABLE`. The three
 * refusals that are not folded into it are each only reachable *after* the
 * caller has proved possession of a live grant for this request, so none
 * discloses anything a probe did not already hold — and collapsing them would
 * leave the customer unable to tell "confirm your contact again" from "that is
 * not the fee we are asking you about".
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
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../customer/application/authorize-secure-link.service';
import {
  isSecureLinkError,
  toSecureLinkHttpException,
} from '../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../customer/infrastructure/rate-limit/public-network-key.service';
import { AcknowledgeShippingFeeUseCase } from '../application/customer/acknowledge-shipping-fee.use-case';
import {
  isShippingFeeAcknowledgementError,
  toShippingFeeAcknowledgementHttpException,
} from '../domain/shipping/shipping-fee-acknowledgement.errors';
import {
  AcknowledgeShippingFeeBody,
  acknowledgeShippingFeeSchema,
} from './schemas/public-order-shipping-fee.request';
import {
  ShippingFeeAcknowledgedResponse,
  type ShippingFeeAcknowledgedHttpView,
} from './schemas/public-order-shipping-fee.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicOrderShippingFee')
@ApiExtraModels(ShippingFeeAcknowledgedResponse)
@Controller('public/orders')
export class PublicOrderShippingFeeController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly acknowledgements: AcknowledgeShippingFeeUseCase,
  ) {}

  @Post('shipping-fee-acknowledgements')
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('SHIPPING_FEE_ACKNOWLEDGED', 'Shipping fee acknowledged.')
  @ApiOperation({
    summary: 'Accept one exact shipping-fee increase on the order a secure link opens',
    description:
      'Records the customer’s decision to accept a specific higher shipping fee. The order, ' +
      'the customer, the fee currently in force, the currency, the grant and the step-up ' +
      'evidence are all resolved by the server from the secure link — only the new fee being ' +
      'accepted is taken from the caller. Inside one transaction the grant is re-checked ' +
      'under its row lock, the shipping detail is locked and must still be editable, the fee ' +
      'must be a genuine increase over the one the order carries, and a recent ' +
      're-verification of the customer’s own contact is required. Exactly one immutable ' +
      'acknowledgement is appended. This changes nothing else: the shipping fee is not ' +
      'updated, the remaining balance is not recalculated, no payment is created and the ' +
      'order does not move — the operator applies the fee afterwards, and can only apply the ' +
      'exact increase acknowledged here. Repeating the same confirmation replays it and ' +
      'writes no second record.',
  })
  @ApiBody({ type: AcknowledgeShippingFeeBody })
  @ApiResponse({
    status: 201,
    description: 'The decision this call recorded, or a replay of an identical earlier one.',
    schema: envelopeSchemaOf(ShippingFeeAcknowledgedResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed body, unknown field, or a fee that is not a valid VND amount.',
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
      'with no reachable order. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded, for another target, or the order has ' +
      'not been created yet.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'SHIPPING_FEE_NOT_INCREASED when the submitted fee is not higher than the fee the ' +
      'order currently carries — including the case where that fee has moved since the ' +
      'screen was rendered, because the baseline is always the server’s; ' +
      'SHIPPING_FEE_NOT_ADJUSTABLE when the shipping detail is already frozen at dispatch ' +
      'and no fee change can be applied to this order at all.',
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
      'ACKNOWLEDGEMENT_POLICY_UNAVAILABLE — secure-link resolution or the step-up policy is ' +
      'not usable. It discloses no configuration internal.',
    schema: ERROR_SCHEMA,
  })
  async acknowledge(
    @Body() body: AcknowledgeShippingFeeBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<ShippingFeeAcknowledgedHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = acknowledgeShippingFeeSchema.parse(body);

    return this.guarded(async () => {
      // The delivered public admission, run before the transaction opens:
      // fail-closed policy read, then the abuse budget, then the digest. A
      // refusal here writes nothing, because there is no transaction yet. It is
      // not the authorization the write acts on — the use case re-establishes
      // the grant inside its own transaction under its row lock (ADR-DB3-004
      // r9), which is what makes a concurrent revoke win.
      const admission: SecureLinkAdmission = await this.links.authorize(request, input.token);
      if (admission.outcome === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(admission.retryAfterSeconds));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const view = await this.acknowledgements.acknowledge({
        token: input.token,
        newFeeAmount: input.newFeeAmount,
      });
      return {
        orderCode: view.orderCode,
        // Copied, never parsed. There is no `Number()` and no arithmetic in
        // this file — a `numeric(14,2)` that became a float here would be
        // rounded on the customer's confirmation screen.
        previousFeeAmount: view.previousFeeAmount,
        newFeeAmount: view.newFeeAmount,
        currencyCode: view.currencyCode,
        acknowledgedAt: view.acknowledgedAt.toISOString(),
        replayed: view.replayed,
      };
    });
  }

  /**
   * Runs the action, translating this surface's two refusal families.
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
      if (isShippingFeeAcknowledgementError(error)) {
        throw toShippingFeeAcknowledgementHttpException(error);
      }
      throw error;
    }
  }
}
