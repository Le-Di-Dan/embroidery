/**
 * The two grant-scoped customer quotation decisions (`APP6-B05`).
 *
 * ```text
 * POST /api/public/quotations/accept — publicQuotation_accept
 * POST /api/public/quotations/reject — publicQuotation_reject
 * ```
 *
 * ### A second class, and the same published domain
 *
 * `PublicQuotationController` keeps `publicQuotation_current`. The split renames
 * nothing: `CONTROLLER_DOMAIN_KEYS` maps this class onto `publicQuotation`, so
 * the two decisions publish as `publicQuotation_accept` and
 * `publicQuotation_reject` and `APP6-B04`'s accepted id is untouched. Without
 * that entry a file-layout decision would have named public identifiers
 * (`publicQuotationDecision_accept`).
 *
 * The split exists for the reason `AdminCustomRequestController` and
 * `AdminCustomRequestModerationController` are split: **the read module holds no
 * transaction manager and no write repository**, so no route on it can reach a
 * lifecycle transition. `CustomerQuotationModule` documents that absence as its
 * security boundary; merging the writes into it would delete the property for
 * `APP6-B04` as well. What a module can inject is what its routes can eventually
 * do, and these two routes need `DatabaseModule`, `CUSTOM_REQUEST_REPOSITORY`
 * and the audit repository — exactly the things a read must not hold.
 *
 * ### Two operations, no third
 *
 * There is no `/status`, no `/respond`, no `/decision`, no generic state
 * mutation, no `PATCH /quotations/{id}` and no identified public quotation path.
 * A public route taking a quotation id would be an enumeration oracle for other
 * customers' prices, and a single `/decision` endpoint carrying the verdict as a
 * body field would make "accept" and "reject" one operation with different
 * guards — GRD-003 applies to one of them and not the other, and a guard that
 * depends on a body value is a guard a body can turn off.
 *
 * There is no third operation for step-up either. Re-verification is APP4's
 * existing public flow; this checkpoint publishes no challenge endpoint, mints
 * no grant and rebuilds none of it.
 *
 * ### POST, and the reason both are POST
 *
 * The credential is a bearer token. `ADR-APP4-001` §11 makes the URL fragment
 * the only browser carrier and declares a query or path carrier `FORBIDDEN` with
 * no fallback, because both are written to the Nginx access log, the application
 * request log, every proxy in between, and the `Referer` of any link the page
 * later renders. These two also genuinely mutate, so the verb is honest as well
 * as necessary.
 *
 * ### Which failures look the same, and which do not
 *
 * Every unusable token — unknown, expired, revoked, superseded, wrong scope —
 * and every unreachable target — no quotation, unset pointer, foreign quotation
 * or version — arrives as one `SecureLinkError` and leaves as one
 * `404 / SECURE_LINK_UNAVAILABLE`, identical to the read's. This class contains
 * no branch on a cause, because it is never told one.
 *
 * `REVERIFICATION_REQUIRED`, `QUOTE_VERSION_STALE` and `INVALID_TRANSITION` are
 * deliberately **not** folded into that answer. Each is only reachable after the
 * caller has already proved possession of a live grant for this request, so none
 * of them discloses anything a probe did not already hold — and collapsing them
 * would leave the customer's screen with no way to tell "confirm your contact
 * again" from "this offer changed" from "your link is dead", which are three
 * different next steps.
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
import { AcceptQuotationUseCase } from '../application/customer/accept-quotation.use-case';
import { RejectQuotationUseCase } from '../application/customer/reject-quotation.use-case';
import {
  isQuotationDecisionError,
  quotationDecisionResponse,
} from '../domain/decision/quotation-decision.errors';
import type { QuotationVersionId } from '../domain/repositories/quotation.repository';
import {
  AcceptQuotationBody,
  RejectQuotationBody,
  acceptQuotationSchema,
  rejectQuotationSchema,
} from './schemas/public-quotation-decision.request';
import {
  QuotationAcceptedResponse,
  QuotationRejectedResponse,
  type QuotationAcceptedHttpView,
  type QuotationRejectedHttpView,
} from './schemas/public-quotation-decision.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

/** The three refusals both routes publish identically. Declared once. */
const SHARED_REFUSALS = {
  badRequest: { status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA },
  rateLimited: {
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  },
  unavailable: {
    status: 503,
    description: 'Secure-link resolution or the step-up policy is not configured.',
    schema: ERROR_SCHEMA,
  },
} as const;

@ApiTags('publicQuotation')
@ApiExtraModels(QuotationAcceptedResponse, QuotationRejectedResponse)
@Controller('public/quotations')
export class PublicQuotationDecisionController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly acceptance: AcceptQuotationUseCase,
    private readonly rejection: RejectQuotationUseCase,
  ) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('QUOTATION_ACCEPTED', 'Quotation accepted.')
  @ApiOperation({
    summary: 'Accept the exact quotation version shown by a secure link',
    description:
      'Accepts the quotation version the customer was looking at, identified by the ' +
      '`versionId` the current-quotation read returned. The custom request is identified by ' +
      'the grant and never by the caller. Inside one transaction the grant is re-checked ' +
      'under its row lock, a recent re-verification of the customer’s own contact is ' +
      'required, the version must still be the current sent one and still inside its ' +
      'validity window, the acceptance evidence is written, and the custom request moves to ' +
      'QUOTE_ACCEPTED as a system projection. A newer sent version makes an older acceptance ' +
      'fail rather than silently accept the new price. Accepting twice replays the first ' +
      'acceptance and writes nothing. No order, payment or reservation is created.',
  })
  @ApiBody({ type: AcceptQuotationBody })
  @ApiResponse({
    status: 200,
    description: 'The committed acceptance, or a replay of an earlier identical one.',
    schema: envelopeSchemaOf(QuotationAcceptedResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
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
      'with no readable current quotation. Identical in status, code, message and shape ' +
      'whether the token is unknown, expired, revoked, superseded, for another target, or ' +
      'the request has simply not been quoted.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'QUOTE_VERSION_STALE when a newer version has been sent or the validity window has ' +
      'closed — re-read and decide again; INVALID_TRANSITION when the custom request has ' +
      'left the state an acceptance can move it from; DUPLICATE_OPERATION when another ' +
      'acceptance of this version is still in flight.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse(SHARED_REFUSALS.unavailable)
  async accept(
    @Body() body: AcceptQuotationBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<QuotationAcceptedHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = acceptQuotationSchema.parse(body);

    return this.guarded(async () => {
      await this.admit(request, input.token, response);
      const view = await this.acceptance.accept({
        token: input.token,
        versionId: input.versionId as QuotationVersionId,
      });
      return {
        versionId: view.versionId,
        version: view.version,
        versionStatus: view.versionStatus,
        quotationStatus: view.quotationStatus,
        requestStatus: view.requestStatus,
        // Copied, never parsed. There is no `Number()` and no arithmetic in this
        // file — a `numeric(14,2)` that became a float here would be rounded on
        // the customer's confirmation screen.
        acceptedTotalAmount: view.acceptedTotalAmount,
        currencyCode: view.currencyCode,
        acceptedAt: view.acceptedAt.toISOString(),
        replayed: view.replayed,
      };
    });
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('QUOTATION_REJECTED', 'Quotation rejected.')
  @ApiOperation({
    summary: 'Decline the exact quotation version shown by a secure link',
    description:
      'Declines the quotation version the customer was looking at. Takes the same two fields ' +
      'as acceptance and requires no re-verification, because declining an offer commits ' +
      'nothing. The version must still be the current sent one; a superseded, already ' +
      'decided or never-sent version is refused and the live offer is left untouched. This ' +
      'moves the quotation only: the custom request is **not** rejected and stays in the ' +
      'quotation stage, where the workshop can send a revised version.',
  })
  @ApiBody({ type: RejectQuotationBody })
  @ApiResponse({
    status: 200,
    description: 'The committed rejection of that exact version.',
    schema: envelopeSchemaOf(QuotationRejectedResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the same single answer the acceptance and the read give to ' +
      'every unusable token and unreachable target.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_TRANSITION — this version is not one a rejection can start from: it has ' +
      'already been decided, has been superseded by a newer send, or was never sent. A ' +
      'repeat rejection of the same version answers here rather than being duplicated.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse(SHARED_REFUSALS.unavailable)
  async reject(
    @Body() body: RejectQuotationBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<QuotationRejectedHttpView> {
    const input = rejectQuotationSchema.parse(body);

    return this.guarded(async () => {
      await this.admit(request, input.token, response);
      const view = await this.rejection.reject({
        token: input.token,
        versionId: input.versionId as QuotationVersionId,
      });
      return {
        versionId: view.versionId,
        version: view.version,
        versionStatus: view.versionStatus,
        quotationStatus: view.quotationStatus,
        rejectedAt: view.rejectedAt.toISOString(),
      };
    });
  }

  /**
   * The public admission, run before either transaction opens.
   *
   * This is `APP6-B04`'s admission unchanged — fail-closed policy read, then the
   * abuse budget, then the digest — so a caller cannot escape
   * `secure_link.resolve`'s budget by spreading token guesses across the read
   * and the two decisions. It is **not** the authorization the writes act on:
   * both use cases re-establish the grant inside their own transaction under its
   * row lock (ADR-DB3-004 r9), which is what makes a concurrent revoke win.
   *
   * A refusal here writes nothing, because there is no transaction yet.
   */
  private async admit(
    request: NetworkReadableRequest,
    token: string,
    response: HeaderSettableResponse,
  ): Promise<void> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, token);
    if (admission.outcome === 'RATE_LIMITED') {
      response.setHeader('Retry-After', String(admission.retryAfterSeconds));
      throw new HttpException(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Runs one decision, translating this surface's two refusal families.
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
      if (isQuotationDecisionError(error)) {
        throw quotationDecisionResponse(error.failure);
      }
      throw error;
    }
  }
}
