/**
 * The one public custom-request operation (`APP5-B01`).
 *
 *   POST /api/public/custom-requests — publicCustomRequest_submit
 *
 * ### Where authorization happens, and why it is conditional
 *
 * A submission is authorized by a verified `SUBMISSION` challenge (GRD-001),
 * which the application re-reads in its own transaction — a guard here could
 * only re-read it a second time, earlier and outside the transaction that has to
 * act on it.
 *
 * What *does* belong here is the APP3 session credential, and only on the
 * catalog branch. That branch submits a live Design Session, whose credential is
 * an ambient `__Host-` cookie with `SameSite=Lax` — so `IMP-D043` PO-05's
 * Origin + Fetch Metadata rule travels with it, in the same order
 * `DesignSessionGuard` applies it: origin first, so a cross-site page cannot
 * make the API read a cookie at all, then the id + secret pair. The COP branch
 * has no session and presents no ambient credential; a caller there must already
 * hold a challenge id, so there is nothing for a cross-site page to ride on and
 * an Origin requirement would only refuse legitimate non-browser callers.
 *
 * `DesignSessionGuard` itself is deliberately **not** used: it reads the session
 * id from a route parameter and this route has none, and it would refuse every
 * COP submission outright.
 *
 * The handler builds no envelope and maps no success shape — it declares its
 * success code and returns data, exactly as every other controller does.
 */
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthorizeDesignSessionService } from '../../design/application/authorize-design-session.service';
import { designSessionOriginRefused } from '../../design/domain/design-session-authorization';
import { DesignSessionOriginPolicy } from '../../design/infrastructure/http/design-session-origin.policy';
import {
  isRequestSubmissionError,
  submissionFailureResponse,
} from '../domain/submission/request-submission.errors';
import {
  SubmitCustomRequestUseCase,
  type SubmittedRequestResult,
} from '../application/submit-custom-request.use-case';
import { CustomRequestSubmissionResponse } from './schemas/custom-request-submission.response';
import {
  submitCustomRequestSchema,
  SubmitCustomRequestBody,
} from './schemas/public-custom-request.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Structural request shape: avoids importing an HTTP-server type. */
interface CredentialCarryingRequest {
  readonly headers: Record<string, unknown>;
}

@ApiTags('publicCustomRequest')
@ApiExtraModels(CustomRequestSubmissionResponse)
@Controller('public/custom-requests')
export class PublicCustomRequestController {
  constructor(
    private readonly submission: SubmitCustomRequestUseCase,
    private readonly origins: DesignSessionOriginPolicy,
    private readonly sessions: AuthorizeDesignSessionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('CUSTOM_REQUEST_SUBMITTED', 'Custom request submitted.')
  @ApiOperation({
    summary: 'Submit a custom request',
    description:
      'Creates one custom request at NEW from a verified SUBMISSION challenge. Exactly one ' +
      'subject is accepted: a catalog product with its ACTIVE design session, or a ' +
      'customer-owned product with at least one accepted COP_IMAGE. The challenge is also the ' +
      'idempotency scope — re-sending the same body replays the same result, and re-using it ' +
      'for a different body is refused. The secure link that opens the request is delivered to ' +
      'the verified contact and never returned here.',
  })
  @ApiBody({ type: SubmitCustomRequestBody })
  @ApiResponse({
    status: 201,
    description: 'The created request, or the replayed result of an earlier identical submission.',
    schema: envelopeSchemaOf(CustomRequestSubmissionResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 401,
    description: 'SESSION_NOT_AUTHORIZED — the design session credential was not accepted.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'Origin or Fetch Metadata refused.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT, or a submission on this challenge is already in flight.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description:
      'SUBMISSION_SUBJECT_INVALID, CUSTOMER_NOT_VERIFIED, SESSION_EXPIRED or ' +
      'REQUEST_ASSET_NOT_BINDABLE.',
    schema: ERROR_SCHEMA,
  })
  async submit(
    @Body() body: SubmitCustomRequestBody,
    @Req() request: CredentialCarryingRequest,
  ): Promise<SubmittedRequestResult> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use `submitCustomRequestSchema`, so they cannot disagree —
    // and nothing here casts request data.
    const input = submitCustomRequestSchema.parse(body);
    const authorizedSessionId = await this.authorizeSession(
      request,
      input.catalog?.designSessionId,
    );

    try {
      return await this.submission.submit({
        challengeId: input.challengeId,
        subject: {
          ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
          ...(input.customerOwnedProduct === undefined
            ? {}
            : { customerOwnedProduct: input.customerOwnedProduct }),
        },
        breakdown: input.breakdown,
        ...(input.customerNote === undefined ? {} : { customerNote: input.customerNote }),
        assets: input.assets,
        ...(authorizedSessionId === undefined ? {} : { authorizedSessionId }),
      });
    } catch (error: unknown) {
      if (isRequestSubmissionError(error)) {
        throw submissionFailureResponse(error.failure);
      }
      throw error;
    }
  }

  /**
   * The APP3 credential check, run only when a session is named.
   *
   * Returns the id a credential was actually verified for, or `undefined` when
   * none was. The use case compares it against the id in the body rather than
   * trusting either alone, so a mismatch cannot submit a session this caller
   * merely named — and it raises the refusal only at the point a session is
   * really about to be submitted, so an honest retry of an already-completed
   * submission replays instead of failing on the session it itself consumed.
   *
   * The **origin** refusal is not deferred, because it is about this HTTP call
   * rather than about the outcome: a cross-site page must be turned away before
   * the API reads a cookie at all, replay or not. No cookie is cleared here
   * either — clearing is a Session-surface act, and this route is not one.
   */
  private async authorizeSession(
    request: CredentialCarryingRequest,
    designSessionId: string | undefined,
  ): Promise<string | undefined> {
    if (designSessionId === undefined) {
      return undefined;
    }
    if (this.origins.evaluate(request) === 'REFUSED') {
      throw designSessionOriginRefused();
    }

    const outcome = await this.sessions.authorize(request, designSessionId);
    return outcome.authorized ? outcome.context.designSessionId : undefined;
  }
}
