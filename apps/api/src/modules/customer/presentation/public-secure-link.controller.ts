/**
 * The one public secure-link operation (`APP4-B06`).
 *
 * ```text
 * POST /api/public/secure-links/resolve — publicSecureLink_resolve
 * ```
 *
 * A **new controller** rather than a fifth method on `PublicVerificationController`:
 * the route prefix differs, and Nest derives an `operationId` from the class
 * name, so folding this in would either publish it under
 * `public/verification/challenges` or force a rename of B03's and B04's four
 * accepted operations. Neither controller is split, renamed or re-prefixed here,
 * so every prior operation id is untouched.
 *
 * ### POST, and the reason it is not a GET
 *
 * A `GET` would have to carry the token in a path segment or a query string, and
 * both are written to the Nginx access log, the application request log, every
 * proxy in between, and the `Referer` header of any link the landing page later
 * renders. `ADR-APP4-001` §11 makes the fragment the only browser carrier and
 * declares a query or path carrier `FORBIDDEN` **with no fallback**; a request
 * body is the only place a bearer credential can travel that no log records.
 * This endpoint is idempotent and side-effect-light despite the verb — resolving
 * a link never consumes it (ADR-DB3-004 r2).
 *
 * ### The order of the three steps is the security model
 *
 * 1. **read the published policy** — fail closed, before anything else;
 * 2. **charge the rate limit** — once per request, before any HMAC work, and
 *    charged identically whatever the token turns out to be;
 * 3. **resolve** — one digest, one query, one answer.
 *
 * Reversing 2 and 3 would make the limiter's cost depend on the credential and
 * hand an attacker free failed guesses; it would also let a flood of garbage
 * tokens spend real CPU on HMACs before being refused.
 *
 * ### Every failure looks the same
 *
 * Unknown, expired, revoked, superseded, wrong target and wrong scope all leave
 * the resolver as one `SecureLinkError` and arrive here as one
 * `404 / SECURE_LINK_UNAVAILABLE` with one message. This class contains no
 * branch on a cause, because it is never told one.
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
import { ResolveSecureLink } from '../application/resolve-secure-link.query';
import type { SecureLinkResolvePolicy } from '../domain/grant/secure-link-policy';
import { isSecureLinkError, toSecureLinkHttpException } from '../domain/grant/secure-link.errors';
import {
  SecureLinkPolicyReader,
  isSecureLinkPolicyUnavailable,
  secureLinkPolicyUnavailableResponse,
} from '../infrastructure/policy/secure-link-policy.reader';
import {
  PublicNetworkKeyService,
  type NetworkReadableRequest,
} from '../infrastructure/rate-limit/public-network-key.service';
import { SecureLinkRateLimiter } from '../infrastructure/rate-limit/secure-link-rate-limiter';
import {
  ResolveSecureLinkBody,
  resolveSecureLinkSchema,
} from './schemas/secure-link-resolve.request';
import {
  SecureLinkResolutionResponse,
  type SecureLinkResolutionView,
} from './schemas/secure-link-resolution.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicSecureLink')
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries a
// dangling `$ref` the generated client cannot name.
@ApiExtraModels(SecureLinkResolutionResponse)
@Controller('public/secure-links')
export class PublicSecureLinkController {
  constructor(
    private readonly resolver: ResolveSecureLink,
    private readonly policies: SecureLinkPolicyReader,
    private readonly limiter: SecureLinkRateLimiter,
    private readonly networkKeys: PublicNetworkKeyService,
  ) {}

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('SECURE_LINK_RESOLVED', 'Secure link resolved.')
  @ApiOperation({
    summary: 'Resolve a secure-link token',
    description:
      'Exchanges the opaque token from a secure link for the request it grants access to. ' +
      'The token travels in the request body only — never in a path, query or header — so it ' +
      'never reaches a server or proxy access log, and it is never echoed back. Resolving a ' +
      'link does not consume it: the same link works until it expires or is revoked. Every ' +
      'token that does not open a live grant — unknown, expired, revoked, superseded, or ' +
      'issued for something else — answers with one identical 404, so the response reveals ' +
      'nothing about whether a token ever existed.',
  })
  @ApiBody({ type: ResolveSecureLinkBody })
  @ApiResponse({
    status: 200,
    description: 'The link is live; here is the request it opens and when it expires.',
    schema: envelopeSchemaOf(SecureLinkResolutionResponse),
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
    description: 'Too many resolve requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Secure-link resolution is not configured.',
    schema: ERROR_SCHEMA,
  })
  async resolve(
    @Body() body: ResolveSecureLinkBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<SecureLinkResolutionView> {
    // Step 1. Fail closed before the token is looked at, so an unconfigured
    // deployment answers identically for every caller and discloses nothing.
    const policy = await this.guardPolicy();

    // Step 2. One charge per request, before any HMAC. `check` cannot see the
    // token and is never called a second time, so the budget moves the same
    // amount whatever the credential turns out to be.
    const decision = this.limiter.check(this.networkKeys.keyFor(request), policy);
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(Math.ceil(decision.retryAfterMs / 1_000)));
      throw new HttpException(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = resolveSecureLinkSchema.parse(body);

    // Step 3.
    try {
      return toView(await this.resolver.resolve({ token: input.token }));
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

  /** Reads the published abuse limit, or refuses with the server-side answer. */
  private async guardPolicy(): Promise<SecureLinkResolvePolicy> {
    try {
      return await this.policies.require();
    } catch (error: unknown) {
      if (isSecureLinkPolicyUnavailable(error)) {
        throw secureLinkPolicyUnavailableResponse();
      }
      throw error;
    }
  }
}

/**
 * The one projection.
 *
 * The resolved grant's id and customer are deliberately dropped here rather than
 * in the response class: the serializer has nowhere to put them, so no future
 * edit to the view type can leak one without also changing this function.
 */
function toView(resolved: {
  readonly customRequestId: string;
  readonly scopeKind: SecureLinkResolutionView['scopeKind'];
  readonly expiresAt: Date;
}): SecureLinkResolutionView {
  return {
    customRequestId: resolved.customRequestId,
    scopeKind: resolved.scopeKind,
    expiresAt: resolved.expiresAt.toISOString(),
  };
}
