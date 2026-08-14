/**
 * The two anonymous verification operations (`APP4-B03`).
 *
 * ```text
 * POST /api/public/verification/challenges                      — publicVerification_issue
 * POST /api/public/verification/challenges/:challengeId/resend  — publicVerification_resend
 * ```
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
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { ResendVerificationChallengeUseCase } from '../application/resend-verification-challenge.use-case';
import type { ChallengeId } from '../domain/repositories/verification-challenge.repository';
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
  VerificationChallengeResponse,
  type VerificationChallengeView,
} from './schemas/verification-challenge.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('publicVerification')
// Registered once for the controller: both operations answer with the same
// component, and referencing it from a response is not the same as publishing
// it — without this the document carries a dangling `$ref` the generated client
// cannot name.
@ApiExtraModels(VerificationChallengeResponse)
@Controller('public/verification/challenges')
export class PublicVerificationController {
  constructor(
    private readonly issuance: IssueVerificationChallengeUseCase,
    private readonly resending: ResendVerificationChallengeUseCase,
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
  };
}
