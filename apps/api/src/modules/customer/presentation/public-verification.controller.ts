/**
 * The four anonymous verification operations (`APP4-B03`, `APP4-B04`).
 *
 * ```text
 * POST /api/public/verification/challenges                        — publicVerification_issue
 * POST /api/public/verification/challenges/:challengeId/resend    — publicVerification_resend
 * POST /api/public/verification/challenges/:challengeId/attempts  — publicVerification_submitAttempt
 * GET  /api/public/verification/challenges/:challengeId           — publicVerification_status
 * ```
 *
 * One controller rather than two: `APP4-B04` answers the same challenges on the
 * same path prefix, and Nest derives an `operationId` from the class name, so
 * splitting would silently rename B03's two published operations and break the
 * generated client for a checkpoint that changed nothing about them.
 *
 * Anonymous by necessity: a `SUBMISSION` challenge is what *precedes* identity,
 * so there is no credential to check and no guard that could apply. What
 * protects the endpoints instead is the policy budget — `maxIssuesPerTargetPerWindow`
 * per target and purpose, and a resend cooldown — both enforced against durable
 * challenge history rather than against anything the caller supplies.
 *
 * Neither operation returns a code, and neither ever will: the plaintext leaves
 * the request only inside the sealed delivery envelope `APP4-W01` opens. The
 * response is a challenge id, an expiry and a resend instant.
 *
 * Every refusal is mapped through one table so no branch here can invent a
 * status or a message, and no failure can accidentally describe whether the
 * destination belongs to a customer.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
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
import { IssueVerificationChallengeUseCase } from '../application/issue-verification-challenge.use-case';
import {
  ReadVerificationChallengeStatus,
  type VerificationChallengeStatus,
} from '../application/read-verification-challenge-status.query';
import { ResendVerificationChallengeUseCase } from '../application/resend-verification-challenge.use-case';
import { SubmitVerificationAttemptUseCase } from '../application/submit-verification-attempt.use-case';
import type { ChallengeId } from '../domain/repositories/verification-challenge.repository';
import {
  verificationAttemptFailureResponse,
  verificationAttemptsExhausted,
  verificationChallengeNotAnswerable,
  verificationCodeMismatch,
} from '../domain/verification/verification-attempt-http.errors';
import {
  LOCKED,
  MISMATCH,
  VERIFIED,
  isVerificationAttemptFailure,
  type VerificationAttemptResult,
} from '../domain/verification/verification-attempt-outcome';
import { verificationFailureResponse } from '../domain/verification/verification-http.errors';
import {
  isVerificationIssueFailure,
  type VerificationChallengeIssued,
} from '../domain/verification/verification-issue-outcome';
import {
  IssueVerificationChallengeBody,
  VerificationChallengeIdParam,
  issueVerificationChallengeSchema,
} from './schemas/public-verification.request';
import {
  SubmitVerificationAttemptBody,
  submitVerificationAttemptSchema,
} from './schemas/verification-attempt.request';
import {
  VerificationChallengeResponse,
  type VerificationChallengeView,
} from './schemas/verification-challenge.response';
import {
  VerificationChallengeStatusResponse,
  type VerificationChallengeStatusView,
} from './schemas/verification-challenge-status.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('publicVerification')
// Registered once for the controller: both operations answer with the same
// component, and referencing it from a response is not the same as publishing
// it — without this the document carries a dangling `$ref` the generated client
// cannot name.
@ApiExtraModels(VerificationChallengeResponse, VerificationChallengeStatusResponse)
@Controller('public/verification/challenges')
export class PublicVerificationController {
  constructor(
    private readonly issuance: IssueVerificationChallengeUseCase,
    private readonly resending: ResendVerificationChallengeUseCase,
    private readonly attempts: SubmitVerificationAttemptUseCase,
    private readonly status: ReadVerificationChallengeStatus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('VERIFICATION_CHALLENGE_ISSUED', 'Verification challenge issued.')
  @ApiOperation({
    summary: 'Request a verification code for a contact',
    description:
      'Opens a one-time code challenge for a destination and purpose, and hands the code ' +
      'to asynchronous delivery. While a challenge is still live the same one is returned ' +
      'unchanged — use the resend operation to replace it. The response never contains the ' +
      'code, and is identical whether or not the destination already belongs to a customer.',
  })
  @ApiBody({ type: IssueVerificationChallengeBody })
  @ApiResponse({
    status: 202,
    description: 'A challenge is open and its code is queued for delivery.',
    schema: envelopeSchemaOf(VerificationChallengeResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 422,
    description: 'That contact cannot be used for verification.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many verification requests for this destination.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Verification is not configured.',
    schema: ERROR_SCHEMA,
  })
  async issue(@Body() body: IssueVerificationChallengeBody): Promise<VerificationChallengeView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree, and no
    // request datum is cast.
    const input = issueVerificationChallengeSchema.parse(body);

    return toView(
      await this.guard(() =>
        this.issuance.issue({
          contactKind: input.contactKind,
          contact: input.contact,
          purpose: input.purpose,
        }),
      ),
    );
  }

  @Post(':challengeId/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('VERIFICATION_CHALLENGE_RESENT', 'Verification challenge reissued.')
  @ApiOperation({
    summary: 'Reissue a verification code',
    description:
      'Replaces a live challenge with a new one carrying a new code, after the configured ' +
      'cooldown. The destination and purpose come from the challenge being replaced, so the ' +
      'request carries no body. This is a business reissue, not a delivery retry.',
  })
  @ApiParam({
    name: 'challengeId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The live challenge to replace.',
  })
  @ApiResponse({
    status: 202,
    description: 'A replacement challenge is open and its code is queued for delivery.',
    schema: envelopeSchemaOf(VerificationChallengeResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed challenge id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 422,
    description: 'That challenge cannot be resent.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'The cooldown has not elapsed, or the budget is spent.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Verification is not configured.',
    schema: ERROR_SCHEMA,
  })
  async resend(@Param() params: VerificationChallengeIdParam): Promise<VerificationChallengeView> {
    return toView(await this.guard(() => this.resending.resend(params.challengeId as ChallengeId)));
  }

  @Post(':challengeId/attempts')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('VERIFICATION_CHALLENGE_VERIFIED', 'Verification challenge verified.')
  @ApiOperation({
    summary: 'Answer a verification challenge',
    description:
      'Submits the six-digit code for a live challenge. A correct code consumes the challenge ' +
      'exactly once and, for a SUBMISSION challenge, establishes the verified customer identity ' +
      'in the same transaction. The response never contains the code, the digest, the contact ' +
      'or the customer, and the challenge cannot be answered again.',
  })
  @ApiParam({
    name: 'challengeId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The challenge being answered.',
  })
  @ApiBody({ type: SubmitVerificationAttemptBody })
  @ApiResponse({
    status: 200,
    description: 'The code matched and the challenge is verified.',
    schema: envelopeSchemaOf(VerificationChallengeStatusResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed body or challenge id.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'The code is wrong, or the challenge can no longer be answered.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'The attempt budget for this challenge is spent.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Verification is not configured, or is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async submitAttempt(
    @Param() params: VerificationChallengeIdParam,
    @Body() body: SubmitVerificationAttemptBody,
  ): Promise<VerificationChallengeStatusView> {
    // As on the issue path: the global pipe already validated this against the
    // same schema, and this second parse is the TypeScript narrowing boundary
    // rather than a second semantic authority.
    const input = submitVerificationAttemptSchema.parse(body);

    const result = await this.guardAttempt(() =>
      this.attempts.submit(params.challengeId as ChallengeId, input.code),
    );
    return toStatusView(assertVerified(result));
  }

  @Get(':challengeId')
  @ApiSuccessCode('VERIFICATION_CHALLENGE_STATUS', 'Verification challenge state.')
  @ApiOperation({
    summary: 'Read the state of a verification challenge',
    description:
      'Reports the lifecycle state and the expiry of one challenge, and nothing else — no ' +
      'contact, no purpose, no customer and no attempt history. A challenge whose expiry has ' +
      'passed reads EXPIRED whether or not a sweep has run. This operation writes nothing.',
  })
  @ApiParam({
    name: 'challengeId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The challenge to read.',
  })
  @ApiResponse({
    status: 200,
    description: 'The current state and expiry of the challenge.',
    schema: envelopeSchemaOf(VerificationChallengeStatusResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed challenge id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such challenge.', schema: ERROR_SCHEMA })
  async readStatus(
    @Param() params: VerificationChallengeIdParam,
  ): Promise<VerificationChallengeStatusView> {
    const status = await this.status.read(params.challengeId as ChallengeId);
    if (status === undefined) {
      throw new NotFoundException('That verification challenge does not exist.');
    }
    return toStatusView(status);
  }

  /**
   * Translates the capability's bounded failures, and only those.
   *
   * Anything else propagates to the platform exception filter, which sanitises
   * it. Catching more broadly here is how a `PersistenceError` — whose
   * diagnostics name a constraint, and whose cause carries PostgreSQL's `DETAIL`
   * quoting the contact — would end up shaped into a response by this file.
   */
  private async guard(
    work: () => Promise<VerificationChallengeIssued>,
  ): Promise<VerificationChallengeIssued> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isVerificationIssueFailure(error)) {
        throw verificationFailureResponse(error.failure);
      }
      throw error;
    }
  }

  /**
   * The attempt path's two bounded error families.
   *
   * `VerificationIssueError` still travels here because the attempt path reads
   * the same published policy through the same reader, and an unconfigured
   * service answers 503 whichever endpoint asked. Anything else propagates.
   */
  private async guardAttempt(
    work: () => Promise<VerificationAttemptResult>,
  ): Promise<VerificationAttemptResult> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isVerificationAttemptFailure(error)) {
        throw verificationAttemptFailureResponse(error.failure);
      }
      if (isVerificationIssueFailure(error)) {
        throw verificationFailureResponse(error.failure);
      }
      throw error;
    }
  }
}

/**
 * Turns the three refusing outcomes into their statuses.
 *
 * They are outcomes rather than errors because each one has already committed
 * durable evidence — an attempt row, a terminal transition — and the throw
 * happens *here*, after that transaction closed, so nothing it wrote is undone.
 */
function assertVerified(result: VerificationAttemptResult): VerificationChallengeStatus {
  switch (result.outcome) {
    case VERIFIED:
      return { challengeId: result.challengeId, state: 'VERIFIED', expiresAt: result.expiresAt };
    case MISMATCH:
      throw verificationCodeMismatch();
    case LOCKED:
      throw verificationAttemptsExhausted();
    default:
      throw verificationChallengeNotAnswerable();
  }
}

/**
 * The one projection.
 *
 * `outcome` is deliberately dropped: whether the challenge was created by this
 * call or already existed is exactly the fact a caller must not be able to read,
 * and the only way to guarantee that is for the serializer to have nowhere to
 * put it.
 */
function toView(issued: VerificationChallengeIssued): VerificationChallengeView {
  return {
    challengeId: issued.challengeId,
    expiresAt: issued.expiresAt.toISOString(),
    resendAvailableAt: issued.resendAvailableAt.toISOString(),
    // Already masked upstream by the one P01 authority; this projection copies
    // it and must never derive, re-derive or widen it.
    recipientMasked: issued.recipientMasked,
  };
}

/** The `APP4-B04` projection. State and expiry, and deliberately nothing else. */
function toStatusView(status: VerificationChallengeStatus): VerificationChallengeStatusView {
  return {
    challengeId: status.challengeId,
    state: status.state,
    expiresAt: status.expiresAt.toISOString(),
  };
}
