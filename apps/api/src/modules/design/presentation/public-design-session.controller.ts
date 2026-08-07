/**
 * The two anonymous Design Session operations (`APP3-B07`).
 *
 *   POST /api/public/design-sessions              — publicDesignSession_create
 *   POST /api/public/design-sessions/:sessionId/resume — publicDesignSession_resume
 *
 * The asymmetry between them is the whole security story. **Resume** carries a
 * credential, so it runs behind `DesignSessionGuard` and reuses every `APP3-B06A`
 * check unchanged. **Create** has no credential yet — there is nothing to
 * authorize — so it may not use that guard: doing so would spend the
 * authorization-failure budget of a session that does not exist and would make
 * the failure counter reachable by anyone. It instead enforces the same Origin
 * and Fetch Metadata policy plus the `IMP-D043` PO-07 *creation* limit, keyed on
 * the opaque network key.
 *
 * Both set exactly one cookie and neither returns the secret in any other form.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { OpenDesignSessionUseCase } from '../application/open-design-session.use-case';
import { ResumeDesignSessionUseCase } from '../application/resume-design-session.use-case';
import type { DesignSessionSnapshotView } from '../application/design-session-snapshot';
import {
  designSessionBootstrapRefused,
  designSessionOriginRefused,
  designSessionRateLimited,
  designSessionUnauthorized,
} from '../domain/design-session-authorization';
import { DesignSessionCookiePolicy } from '../infrastructure/http/design-session-cookie.policy';
import { DesignSessionOriginPolicy } from '../infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from '../infrastructure/rate-limit/design-session-rate-limiter';
import { EphemeralNetworkKeyService } from '../infrastructure/rate-limit/ephemeral-network-key.service';
import { CurrentDesignSession, type DesignSessionContext } from './design-session-context';
import { DesignSessionGuard } from './guards/design-session.guard';
import {
  createDesignSessionSchema,
  CreateDesignSessionBody,
  DesignSessionIdParam,
} from './schemas/public-design-session.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

interface OriginReadableRequest {
  readonly headers: Record<string, unknown>;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

interface CookieWritableResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('publicDesignSession')
@Controller('public/design-sessions')
export class PublicDesignSessionController {
  constructor(
    private readonly open: OpenDesignSessionUseCase,
    private readonly resumption: ResumeDesignSessionUseCase,
    private readonly origins: DesignSessionOriginPolicy,
    private readonly limiter: DesignSessionRateLimiter,
    private readonly networkKeys: EphemeralNetworkKeyService,
    private readonly cookies: DesignSessionCookiePolicy,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('DESIGN_SESSION_CREATED', 'Design session opened.')
  @ApiOperation({
    summary: 'Open an anonymous design session',
    description:
      'Opens one session on an exact public placement, either empty or cloned from a ' +
      'published Template scoped to that same placement. The session secret is returned ' +
      'only as a host-only, HttpOnly cookie.',
  })
  @ApiBody({ type: CreateDesignSessionBody })
  @ApiResponse({ status: 201, description: 'The session and its initial document.' })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Origin or Fetch Metadata refused.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'The placement or Template cannot open a session.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 429, description: 'Too many sessions created.', schema: ERROR_SCHEMA })
  async create(
    @Body() body: CreateDesignSessionBody,
    @Req() request: OriginReadableRequest,
    @Res({ passthrough: true }) response: CookieWritableResponse,
  ): Promise<DesignSessionSnapshotView> {
    if (this.origins.evaluate(request) === 'REFUSED') {
      throw designSessionOriginRefused();
    }
    if (!this.limiter.checkCreation(this.networkKeys.keyFor(request)).allowed) {
      throw designSessionRateLimited();
    }

    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Because both use `createDesignSessionSchema`, the two can never
    // disagree — and nothing here casts request data.
    const input = createDesignSessionSchema.parse(body);

    const outcome = await this.open.open({
      productSlug: input.productSlug,
      sideCode: input.sideCode,
      areaCode: input.areaCode,
      // Clone-only fields are reachable only inside the discriminated branch.
      ...(input.mode === 'CLONE_TEMPLATE' ? { templateSlug: input.templateSlug } : {}),
    });
    if (!outcome.ok) {
      // One shape for every reason: an unpublished Product, a retired Area, a
      // draft Template and an out-of-bounds document are all "this placement
      // cannot open a session", and distinguishing them would describe catalog
      // rows an anonymous caller was never shown.
      throw designSessionBootstrapRefused();
    }

    response.setHeader(
      'Set-Cookie',
      this.cookies.serializeSessionCookie(
        outcome.snapshot.sessionId,
        outcome.rawSecret,
        outcome.expiresAt,
        new Date(),
      ),
    );
    return outcome.snapshot;
  }

  @Post(':sessionId/resume')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DesignSessionGuard)
  @ApiSuccessCode('DESIGN_SESSION_RESUMED', 'Design session resumed.')
  @ApiOperation({
    summary: 'Resume an anonymous design session',
    description:
      'Rotates the session secret and returns the current snapshot. The previous secret ' +
      'stops working immediately; expiry and document revision are unchanged.',
  })
  @ApiParam({
    name: 'sessionId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'Public Design Session identifier.',
  })
  @ApiResponse({ status: 200, description: 'The current session snapshot.' })
  @ApiResponse({
    status: 401,
    description: 'The session could not be authorized.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: 'Origin or Fetch Metadata refused.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 429, description: 'Too many requests.', schema: ERROR_SCHEMA })
  async resume(
    @Param() params: DesignSessionIdParam,
    @CurrentDesignSession() context: DesignSessionContext,
    @Res({ passthrough: true }) response: CookieWritableResponse,
  ): Promise<DesignSessionSnapshotView> {
    const outcome = await this.resumption.resume(context.designSessionId);
    if (!outcome.ok) {
      // A lost rotation race is indistinguishable from any other failed
      // authorization, which is exactly the point: the loser's secret is dead.
      throw designSessionUnauthorized();
    }

    response.setHeader(
      'Set-Cookie',
      this.cookies.serializeSessionCookie(
        params.sessionId,
        outcome.rawSecret,
        outcome.expiresAt,
        new Date(),
      ),
    );
    return outcome.snapshot;
  }
}
