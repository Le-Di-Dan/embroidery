/**
 * The one grant-scoped customer read (`APP5-B03`).
 *
 * ```text
 * POST /api/public/custom-requests/status — publicCustomRequest_status
 * ```
 *
 * ### One operation, and no list
 *
 * There is exactly one handler on this class and it addresses no collection.
 * `APP5-R00` §10.2 and `APP5-G01` §10 exclude a customer request list outright —
 * no customer account or session exists, so there is no identity a list could be
 * scoped to, and scoping one to a contact value would make the endpoint an
 * enumeration oracle for other people's requests. The route has no `GET`
 * collection form, no filter, no pagination and no cursor, because it addresses
 * a request the caller must already hold a credential for.
 *
 * ### A separate class from `PublicCustomRequestController`
 *
 * Submission needs Design and the grant issuer; this read needs neither, and
 * needs the secure-link admission and the catalog subject port instead
 * (`custom-request-status.module.ts`). Splitting the class is a dependency-shape
 * decision, and `CONTROLLER_DOMAIN_KEYS` exists precisely so a file-layout
 * decision does not rename a public identifier: both classes publish the
 * `publicCustomRequest` domain, so `APP5-B01`'s `publicCustomRequest_submit` is
 * untouched and this operation joins it as `publicCustomRequest_status`.
 *
 * ### POST, and the reason it is not a GET
 *
 * The credential is a bearer token. A `GET` would have to carry it in a path
 * segment or query string, and both are written to the Nginx access log, the
 * application request log, every proxy in between, and the `Referer` header of
 * any link the page later renders. `ADR-APP4-001` §11 makes the URL fragment the
 * only browser carrier and declares a query or path carrier `FORBIDDEN` with no
 * fallback. The operation is idempotent and consumes nothing despite the verb —
 * ADR-DB3-004 r2 keeps a link multi-use within its validity, so refreshing a
 * status page must not burn it.
 *
 * ### Every failure looks the same
 *
 * Unknown, malformed-but-well-formed, expired, revoked, superseded, wrong scope
 * and wrong target all arrive here as one `SecureLinkError` and leave as one
 * `404 / SECURE_LINK_UNAVAILABLE`. So does a grant whose request row cannot be
 * read. This class contains no branch on a cause, because it is never told one,
 * and it adds no `REQUEST_NOT_FOUND` code for the same reason.
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
  ReadGrantScopedRequest,
  type GrantScopedRequestView,
} from '../application/status/read-grant-scoped-request.query';
import {
  ReadCustomRequestStatusBody,
  readCustomRequestStatusSchema,
} from './schemas/custom-request-status.request';
import {
  CatalogRequestSubjectResponse,
  CustomRequestStatusResponse,
  CustomerOwnedRequestSubjectResponse,
  RequestAssetResponse,
  RequestQuantityLineResponse,
  type CustomRequestStatusView,
} from './schemas/custom-request-status.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicCustomRequest')
// Registered once for the controller: referencing a component from a response
// is not the same as publishing it, and without this the document carries
// dangling `$ref`s the generated client cannot name.
@ApiExtraModels(
  CustomRequestStatusResponse,
  CatalogRequestSubjectResponse,
  CustomerOwnedRequestSubjectResponse,
  RequestQuantityLineResponse,
  RequestAssetResponse,
)
@Controller('public/custom-requests')
export class PublicCustomRequestStatusController {
  constructor(private readonly requests: ReadGrantScopedRequest) {}

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('CUSTOM_REQUEST_STATUS_READ', 'Custom request status read.')
  @ApiOperation({
    summary: 'Read the request a secure link opens',
    description:
      'Returns the one custom request the presented secure link grants access to. The request ' +
      'is identified by the grant, never by the caller: there is no request id, no request ' +
      'code and no customer identifier in the body, so a link opens exactly the request it was ' +
      'issued for and nothing else. The request code is returned for display and is never ' +
      'accepted as a credential. There is no customer request list. Every token that does not ' +
      'open a live grant — unknown, expired, revoked, superseded, or issued for something ' +
      'else — answers with one identical 404.',
  })
  @ApiBody({ type: ReadCustomRequestStatusBody })
  @ApiResponse({
    status: 200,
    description: 'The request this link opens, projected for its customer.',
    schema: envelopeSchemaOf(CustomRequestStatusResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token. Identical in status, ' +
      'code, message and shape whether the token is unknown, expired, revoked, superseded or ' +
      'for another target.',
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
  async status(
    @Body() body: ReadCustomRequestStatusBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<CustomRequestStatusView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readCustomRequestStatusSchema.parse(body);

    try {
      const outcome = await this.requests.read(request, { token: input.token });
      if (outcome.outcome === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return toView(outcome.view);
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
 */
function toView(view: GrantScopedRequestView): CustomRequestStatusView {
  return {
    requestId: view.requestId,
    code: view.code,
    status: view.status,
    submittedAt: view.submittedAt.toISOString(),
    subject: view.subject,
    quantities: view.quantities.map((line) => ({
      productVariantId: line.productVariantId,
      sizeLabel: line.sizeLabel,
      quantity: line.quantity,
    })),
    totalQuantity: view.totalQuantity,
    assets: view.assets.map((asset) => ({ assetId: asset.assetId, role: asset.role })),
    customerVisibleReason: view.customerVisibleReason,
    accessExpiresAt: view.accessExpiresAt.toISOString(),
  };
}
