/**
 * Staff session endpoints (ADR-APP1-001): open and close an admin session.
 *
 *   POST   /api/staff/session  — login  (staffSession_create)
 *   DELETE /api/staff/session  — logout (staffSession_delete)
 *
 * Both return `204 No Content` with no envelope body; the token travels only in
 * the `Set-Cookie` header, never in JSON. The controller owns transport concerns
 * (validation, cookie, headers, error mapping); the use cases own the flow.
 */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { AuthenticateStaffUseCase } from '../application/authenticate-staff.use-case';
import { RevokeStaffSessionUseCase } from '../application/revoke-staff-session.use-case';
import { StaffLoginFailedError, StaffRateLimitedError } from '../domain/staff-auth.errors';
import type { AdminSessionId } from '../domain/repositories/admin-session.repository';
import { CookiePolicyService } from '../infrastructure/http/cookie-policy.service';
import { AuthenticatedAdminGuard } from './guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from './guards/staff-json-body.guard';
import { StaffOriginGuard } from './guards/staff-origin.guard';
import { StaffLoginRequest, StaffLoginRequestDto } from './schemas/staff-login.request';
import type { StaffAuthenticatedRequest } from './staff-request';

/** Minimal response contract: avoids importing the Express type. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): void;
}

const NO_STORE = 'no-store';

@ApiTags('staff')
@Controller('staff/session')
export class StaffSessionController {
  constructor(
    private readonly login: AuthenticateStaffUseCase,
    private readonly revoke: RevokeStaffSessionUseCase,
    private readonly cookies: CookiePolicyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiOperation({
    summary: 'Open a staff session',
    description:
      'Authenticates the admin by email and password and sets an HttpOnly, ' +
      'SameSite=Strict session cookie. The session token is never returned in the body.',
  })
  @ApiBody({ type: StaffLoginRequest })
  @ApiNoContentResponse({ description: 'Session established; token set via Set-Cookie.' })
  @ApiBadRequestResponse({ description: 'Malformed body; field-level errors[] are returned.' })
  @ApiUnauthorizedResponse({ description: 'Uniform STAFF_LOGIN_FAILED (no account enumeration).' })
  @ApiForbiddenResponse({ description: 'Request origin is not allowed.' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Body is not application/json.' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
  })
  async create(
    @Req() request: StaffAuthenticatedRequest,
    @Body() body: StaffLoginRequestDto,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<void> {
    // `body` is already validated and normalized by the global ZodValidationPipe;
    // the controller performs no field validation of its own.
    try {
      const { rawToken } = await this.login.authenticate({
        email: body.email,
        password: body.password,
        ipAddress: request.ip,
      });
      response.setHeader('Set-Cookie', this.cookies.serializeSessionCookie(rawToken));
      response.setHeader('Cache-Control', NO_STORE);
    } catch (error: unknown) {
      throw this.toHttpError(error, response);
    }
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(StaffOriginGuard, AuthenticatedAdminGuard)
  // Matches the `adminSession` scheme registered in openapi-document.config.
  @ApiCookieAuth('adminSession')
  @ApiOperation({
    summary: 'Close the current staff session',
    description: 'Revokes the current server-side session and clears the cookie.',
  })
  @ApiNoContentResponse({ description: 'Session revoked; cookie cleared via Set-Cookie.' })
  @ApiUnauthorizedResponse({ description: 'No live session.' })
  @ApiForbiddenResponse({ description: 'Request origin is not allowed.' })
  async delete(
    @Req() request: StaffAuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<void> {
    const session = request.staffSession;
    if (session === undefined) {
      // Unreachable — the guard admits only a resolved session — but never trust
      // an absent view into a live logout.
      throw new UnauthorizedException();
    }
    await this.revoke.logout(session.sessionId as AdminSessionId, session.adminId);
    response.setHeader('Set-Cookie', this.cookies.serializeDeletionCookie());
    response.setHeader('Cache-Control', NO_STORE);
  }

  /** Maps a login domain error to its safe HTTP response. */
  private toHttpError(error: unknown, response: HeaderSettableResponse): HttpException {
    if (error instanceof StaffRateLimitedError) {
      response.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
      return new HttpException(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error instanceof StaffLoginFailedError) {
      return new UnauthorizedException({
        code: 'STAFF_LOGIN_FAILED',
        message: 'Invalid email or password.',
      });
    }
    // An unexpected error is re-thrown for the platform filter to sanitize.
    throw error;
  }
}
