/**
 * The one grant-scoped customer design review read (`APP6-B10`).
 *
 * ```text
 * POST /api/public/design-reviews/current — publicDesignReview_current
 * ```
 *
 * ### One operation, and no locator in it
 *
 * There is exactly one handler on this class and it addresses no collection and
 * no identified resource. `current` is not a version id: the request the link
 * opens is read from the grant row, the Design Case from that request's own
 * `current_design_case_id` pointer, and the version from the `SENT_FOR_REVIEW`
 * partial unique index that already decided which one is under review. There is
 * no `/public/design-reviews/{id}`, no review history read and no second
 * "resolve design" endpoint, because a public route that took an id would be an
 * enumeration oracle for other customers' artwork.
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
 * re-opening their design page must not burn it.
 *
 * ### `no-store`, and why it is stronger here than on a price
 *
 * The body carries a customer's unapproved artwork. A shared or proxy cache
 * holding it would serve one customer's design to whoever presented the same URL
 * — and the URL is identical for every customer, because the credential is in
 * the body. `no-store` is set on the success path and, by the platform filter's
 * shape, nothing else on this route has a body worth caching.
 *
 * ### A separate class from the Admin design-version controllers
 *
 * They publish `adminCustomRequestDesignVersion` behind the APP1 guards; this
 * publishes `publicDesignReview` behind a secure-link token and nothing else.
 * The split is a dependency-shape decision as much as a contract one —
 * `customer-design-review.module.ts` records what this surface may inject — and
 * because the class name derives its own domain key, no `CONTROLLER_DOMAIN_KEYS`
 * entry is needed and B07's, B08's and B09's accepted operation ids are
 * untouched.
 *
 * ### Every definitive failure looks the same
 *
 * Unknown token, expired, revoked, superseded, wrong scope, an unreadable
 * request, an unset or dangling Design Case pointer, a case belonging to another
 * request, no version in review, a review belonging to another case — all arrive
 * here as one `SecureLinkError` and leave as one `404 SECURE_LINK_UNAVAILABLE`.
 * This class contains no branch on a cause, because it is never told one.
 *
 * An unresolvable **agreement set** is the one thing that must not collapse into
 * that answer: the link is live and the design is real, and a `404` would send a
 * customer to support to replace a working link while hiding the configuration
 * an operator can fix. It is a bounded `503` naming no policy key and no
 * agreement type.
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
  ReadCurrentDesignReview,
  type CurrentDesignReviewOutcome,
} from '../application/review/read-current-design-review.query';
import type { CustomerDesignReviewView } from '../application/review/customer-design-review.view';
import {
  isDesignReviewTermsUnavailable,
  designReviewTermsUnavailableResponse,
} from '../domain/review/design-review.errors';
import {
  ReadCurrentDesignReviewBody,
  readCurrentDesignReviewSchema,
} from './schemas/public-design-review.request';
import {
  CustomerDesignReviewResponse,
  DesignReviewAgreementResponse,
  type CustomerDesignReviewHttpView,
} from './schemas/public-design-review.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The design under review must never be held by a shared or browser cache. */
const REVIEW_CACHE_CONTROL = 'no-store';

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicDesignReview')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(CustomerDesignReviewResponse, DesignReviewAgreementResponse)
@Controller('public/design-reviews')
export class PublicDesignReviewController {
  constructor(private readonly reviews: ReadCurrentDesignReview) {}

  @Post('current')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('CURRENT_DESIGN_REVIEW_READ', 'Current design review read.')
  @ApiOperation({
    summary: 'Read the design version a secure link opens for review',
    description:
      'Returns the design version currently awaiting the customer’s decision on the one custom ' +
      'request the presented secure link grants access to, together with the complete effective ' +
      'agreement set an approval will bind. The request is identified by the grant, the design ' +
      'case by the request’s own pointer, and the version by the send that put it in review — ' +
      'never by the caller: there is no version id, case id, request id or customer identifier ' +
      'in the body. A newer draft the workshop is still authoring is never returned; a later ' +
      'legitimate send is visible on the next call. The document is returned exactly as stored, ' +
      'with the hash computed at send. Nothing is written: no acceptance is recorded here, and ' +
      'no step-up re-verification is required to read. Every token that does not open a live ' +
      'grant, and every request with no design awaiting review, answer with one identical 404.',
  })
  @ApiBody({ type: ReadCurrentDesignReviewBody })
  @ApiResponse({
    status: 200,
    description: 'The design under review and the terms its approval will bind.',
    headers: {
      'Cache-Control': {
        description: 'Always `no-store`. This body is one customer’s unapproved artwork.',
        schema: { type: 'string' },
      },
    },
    schema: envelopeSchemaOf(CustomerDesignReviewResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every request with ' +
      'no readable design awaiting review. Identical in status, code, message and shape whether ' +
      'the token is unknown, expired, revoked, superseded, for another target, or the workshop ' +
      'has simply not sent a design yet.',
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
      'Secure-link resolution is not configured, or the required agreement set cannot be ' +
      'resolved completely. Distinct from 404 on purpose: the link is usable and the design is ' +
      'real, so reporting it as unavailable would hide a configuration fault behind a dead-link ' +
      'answer. Names no policy key and no agreement type.',
    schema: ERROR_SCHEMA,
  })
  async current(
    @Body() body: ReadCurrentDesignReviewBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomerDesignReviewHttpView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readCurrentDesignReviewSchema.parse(body);

    try {
      const outcome: CurrentDesignReviewOutcome = await this.reviews.read(request, {
        token: input.token,
      });
      if (outcome.outcome === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      response.setHeader('Cache-Control', REVIEW_CACHE_CONTROL);
      return toHttpView(outcome.view);
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        throw toSecureLinkHttpException(error);
      }
      if (isDesignReviewTermsUnavailable(error)) {
        throw designReviewTermsUnavailableResponse();
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
 * `document` crosses as the value it already is. There is no clone, no
 * re-serialisation, no key reordering and no `JSON.parse(JSON.stringify(...))`
 * — the returned bytes must stay the ones `documentHash` was computed over, and
 * a round-trip through a second canonicalizer is exactly how they would stop
 * being.
 */
function toHttpView(view: CustomerDesignReviewView): CustomerDesignReviewHttpView {
  return {
    designVersionId: view.designVersionId,
    version: view.version,
    documentSchemaVersion: view.documentSchemaVersion,
    documentHash: view.documentHash,
    sentAt: view.sentAt.toISOString(),
    document: view.document,
    agreements: view.agreements.map((agreement) => ({
      agreementVersionId: agreement.agreementVersionId,
      agreementType: agreement.agreementType,
      version: agreement.version,
      contentHash: agreement.contentHash,
      language: agreement.language,
      content: agreement.content,
    })),
    accessExpiresAt: view.accessExpiresAt.toISOString(),
  };
}
