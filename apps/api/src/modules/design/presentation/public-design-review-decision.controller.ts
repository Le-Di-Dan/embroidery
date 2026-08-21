/**
 * The two grant-scoped customer design decisions (`APP6-B11`).
 *
 * ```text
 * POST /api/public/design-reviews/approve           — publicDesignReview_approve
 * POST /api/public/design-reviews/request-revision   — publicDesignReview_requestRevision
 * ```
 *
 * ### Two operations, and no locator in either
 *
 * There are exactly two handlers on this class and neither addresses a
 * collection or an identified resource. `versionId` travels in the body as a
 * *fingerprint of what the customer was looking at*, never as a path segment
 * that could be walked: there is no `/public/design-reviews/{id}/approve`, no
 * generic `/decision` taking an outcome, and no status-mutation route, because a
 * public path that took an id would be an enumeration oracle for other
 * customers' artwork and a generic outcome field would make "approve" and
 * "request revision" a value rather than an operation.
 *
 * ### POST, and the reason it is not a PATCH
 *
 * The credential is a bearer token and must reach the server in the body alone
 * (`ADR-APP4-001` §11). Beyond that these are creations, not edits: an approval
 * creates a decision record and an Approval Snapshot, and a revision request
 * creates a decision record. Nothing is patched — an approved version is
 * immutable, and LC-08 corrections are new versions.
 *
 * ### A second class beside `PublicDesignReviewController`
 *
 * `APP6-B10`'s read module is *defined* by an absence: it imports no
 * `DatabaseModule`, so nothing composed there can open a transaction, and a
 * write that needed one could not be added without changing that file. These two
 * routes need a transaction manager, an idempotency store, three write
 * repositories, the audit repository and the outbox. Merging them in would
 * delete B10's documented security property to gain nothing — the read and the
 * writes share no provider — and would leave one module whose injector explains
 * neither surface. The same split, and the same reason, as
 * `AdminCustomRequestController` / `AdminCustomRequestModerationController` and
 * `PublicQuotationController` / `PublicQuotationDecisionController`.
 *
 * `CONTROLLER_DOMAIN_KEYS` keeps both classes publishing one `publicDesignReview`
 * domain, so B10's `publicDesignReview_current` is untouched and the family
 * reads `_current`, `_approve`, `_requestRevision`. Without that entry these two
 * would mint `publicDesignReviewDecision_approve`, letting a module boundary
 * name a public identifier.
 *
 * ### Four refusal families, and why they are not collapsed
 *
 * `SECURE_LINK_UNAVAILABLE` (404) is every unusable token and every unreachable
 * target, identical to the read's. `REVERIFICATION_REQUIRED` (403) is the live
 * link that lacks a fresh step-up — approval only. `APPROVAL_VERSION_MISMATCH`
 * and `TERMS_NOT_ACCEPTED` (409) are the two things the customer can fix by
 * re-reading. `INVALID_TRANSITION` (409) is the decision that was already made.
 * Each is reachable only *after* the caller has proved possession of a live
 * grant for this request, so none discloses anything a probe did not already
 * hold — and collapsing them would leave the customer's screen unable to tell
 * "confirm your contact" from "the design changed" from "the terms changed" from
 * "your link is dead", which are four different next steps.
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
import { ApproveDesignVersionUseCase } from '../application/deciding/approve-design-version.use-case';
import { RequestDesignRevisionUseCase } from '../application/deciding/request-design-revision.use-case';
import {
  isDesignDecisionError,
  designDecisionResponse,
} from '../domain/review/design-decision.errors';
import {
  isDesignReviewTermsUnavailable,
  designReviewTermsUnavailableResponse,
} from '../domain/review/design-review.errors';
import type { DesignVersionId } from '../domain/repositories/design-case.repository';
import {
  ApproveDesignVersionBody,
  RequestDesignRevisionBody,
  approveDesignVersionSchema,
  requestDesignRevisionSchema,
} from './schemas/public-design-decision.request';
import {
  DesignApprovedResponse,
  DesignRevisionRequestedResponse,
  type DesignApprovedHttpView,
  type DesignRevisionRequestedHttpView,
} from './schemas/public-design-decision.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

/** The three refusals both routes publish identically. Declared once. */
const SHARED_REFUSALS = {
  badRequest: { status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA },
  notFound: {
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request ' +
      'with no readable design awaiting a decision. Identical in status, code, message and ' +
      'shape whether the token is unknown, expired, revoked, superseded, for another target, ' +
      'or the named version belongs to another customer’s design case.',
    schema: ERROR_SCHEMA,
  },
  rateLimited: {
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  },
  unavailable: {
    status: 503,
    description:
      'Secure-link resolution, the step-up policy, or the required agreement set is not ' +
      'configured, or the approval evidence cannot be resolved. Distinct from 404 on ' +
      'purpose: the link is usable and the design is real, so reporting it as unavailable ' +
      'would hide a configuration fault behind a dead-link answer. Names no policy key, no ' +
      'agreement type and no column.',
    schema: ERROR_SCHEMA,
  },
} as const;

@ApiTags('publicDesignReview')
@ApiExtraModels(DesignApprovedResponse, DesignRevisionRequestedResponse)
@Controller('public/design-reviews')
export class PublicDesignReviewDecisionController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly approval: ApproveDesignVersionUseCase,
    private readonly revision: RequestDesignRevisionUseCase,
  ) {}

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_APPROVED', 'Design approved.')
  @ApiOperation({
    summary: 'Approve the exact design version shown by a secure link',
    description:
      'Approves the design version the customer was looking at, identified by the ' +
      '`designVersionId` and `documentHash` the current-review read returned, together with ' +
      'the exact set of terms they accepted. The custom request and the customer are ' +
      'identified by the grant and never by the caller. Inside one transaction the grant is ' +
      're-checked under its row lock, a recent re-verification of the customer’s own contact ' +
      'is required, the version must still be the one awaiting a decision and must still ' +
      'hash to what was sent, the submitted agreements must be exactly the effective ' +
      'required set, an immutable Approval Snapshot is frozen from the exact version, and ' +
      'the custom request moves to APPROVED as a system projection. Approving twice replays ' +
      'the first approval and writes nothing. No order, payment obligation, reservation or ' +
      'production job is created here: the approval event is the hand-off.',
  })
  @ApiBody({ type: ApproveDesignVersionBody })
  @ApiResponse({
    status: 200,
    description: 'The committed approval, or a replay of an earlier identical one.',
    schema: envelopeSchemaOf(DesignApprovedResponse),
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
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse({
    status: 409,
    description:
      'APPROVAL_VERSION_MISMATCH when the submitted hash is not the stored one or the ' +
      'version is no longer awaiting approval — re-read the design and decide again; ' +
      'TERMS_NOT_ACCEPTED when the submitted agreements are not exactly the current ' +
      'effective set — re-read the terms and confirm again; INVALID_TRANSITION when this ' +
      'version has already been decided or the request has left the state an approval can ' +
      'move it from; DUPLICATE_OPERATION when another approval of this version is still in ' +
      'flight; IDEMPOTENCY_CONFLICT when this version was already approved against ' +
      'different evidence.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse(SHARED_REFUSALS.unavailable)
  async approve(
    @Body() body: ApproveDesignVersionBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<DesignApprovedHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = approveDesignVersionSchema.parse(body);

    return this.guarded(async () => {
      await this.admit(request, input.token, response);
      const view = await this.approval.approve({
        token: input.token,
        versionId: input.versionId as DesignVersionId,
        documentHash: input.documentHash,
        acceptedAgreements: input.acceptedAgreements,
      });
      return {
        versionId: view.versionId,
        version: view.version,
        versionStatus: view.versionStatus,
        approvalSnapshotId: view.approvalSnapshotId,
        documentHash: view.documentHash,
        requestStatus: view.requestStatus,
        approvedAt: view.approvedAt.toISOString(),
        replayed: view.replayed,
      };
    });
  }

  @Post('request-revision')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_REVISION_REQUESTED', 'Design revision requested.')
  @ApiOperation({
    summary: 'Ask for a revision of the exact design version shown by a secure link',
    description:
      'Records that the customer wants the design version they were shown changed, with ' +
      'their own description of what to change. Requires the secure link and nothing else — ' +
      'no re-verification, because asking for a change commits nothing — and accepts no ' +
      'terms and no hash. The version must still be the one awaiting a decision; a version ' +
      'that has already been approved or already had a revision requested is refused, ' +
      'because the first decision wins. This moves the design version only: the custom ' +
      'request stays in the design-review stage, no transition is written, and the next ' +
      'draft is authored by the workshop, not here.',
  })
  @ApiBody({ type: RequestDesignRevisionBody })
  @ApiResponse({
    status: 200,
    description: 'The committed revision request on that exact version.',
    schema: envelopeSchemaOf(DesignRevisionRequestedResponse),
  })
  @ApiResponse(SHARED_REFUSALS.badRequest)
  @ApiResponse(SHARED_REFUSALS.notFound)
  @ApiResponse({
    status: 409,
    description:
      'INVALID_TRANSITION — this version is not one a revision request can start from: it ' +
      'has already been decided, has been superseded by a newer send, or was never sent. A ' +
      'repeat request on the same version answers here rather than being duplicated. This ' +
      'route never answers REVERIFICATION_REQUIRED, APPROVAL_VERSION_MISMATCH or ' +
      'TERMS_NOT_ACCEPTED: none of those guards applies to it.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(SHARED_REFUSALS.rateLimited)
  @ApiResponse(SHARED_REFUSALS.unavailable)
  async requestRevision(
    @Body() body: RequestDesignRevisionBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<DesignRevisionRequestedHttpView> {
    const input = requestDesignRevisionSchema.parse(body);

    return this.guarded(async () => {
      await this.admit(request, input.token, response);
      const view = await this.revision.requestRevision({
        token: input.token,
        versionId: input.versionId as DesignVersionId,
        feedback: input.feedback,
      });
      return {
        versionId: view.versionId,
        version: view.version,
        versionStatus: view.versionStatus,
        requestStatus: view.requestStatus,
        decidedAt: view.decidedAt.toISOString(),
      };
    });
  }

  /**
   * The public admission, run before either transaction opens.
   *
   * This is `APP6-B10`'s admission unchanged — fail-closed policy read, then the
   * abuse budget, then the digest — so a caller cannot escape
   * `secure_link.resolve`'s budget by spreading token guesses across the read
   * and the two decisions. It is **not** the authorization the writes act on:
   * both use cases re-establish the grant inside their own transaction under its
   * row lock (ADR-DB3-004 r9), which is what makes a concurrent revoke win
   * (CC-16).
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
   * Runs one decision, translating this surface's three refusal families.
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
      if (isDesignDecisionError(error)) {
        throw designDecisionResponse(error.failure);
      }
      if (isDesignReviewTermsUnavailable(error)) {
        // The deployment cannot state what the customer would be agreeing to.
        // B10's bounded 503, reused verbatim so the read and the approval answer
        // an unconfigured agreement set identically.
        throw designReviewTermsUnavailableResponse();
      }
      throw error;
    }
  }
}
