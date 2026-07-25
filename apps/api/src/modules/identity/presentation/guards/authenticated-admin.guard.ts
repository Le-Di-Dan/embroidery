/**
 * Authenticated-admin guard (ADR-APP1-001 §10).
 *
 * Resolves the session cookie to a live admin, binds the ADMIN actor exactly
 * once, and attaches a safe session view to the request. It reads no
 * Authorization bearer token, rejects a missing/invalid/expired/revoked session
 * as 401 (binding nothing), and audits the one case worth recording: a valid
 * session whose account was disabled mid-life. There is no role check — B01 is a
 * binary authenticated-admin gate.
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { createAdminActor } from '../../../../platform/actor-context/request-actor';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { ResolveStaffSessionService } from '../../application/resolve-staff-session.service';
import { StaffAuditWriter } from '../../application/staff-audit.writer';
import { CookiePolicyService } from '../../infrastructure/http/cookie-policy.service';
import type { StaffAuthenticatedRequest } from '../staff-request';

@Injectable()
export class AuthenticatedAdminGuard implements CanActivate {
  constructor(
    private readonly cookies: CookiePolicyService,
    private readonly resolver: ResolveStaffSessionService,
    private readonly requestContext: RequestContextService,
    private readonly audit: StaffAuditWriter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffAuthenticatedRequest>();
    const { token, ambiguous } = this.cookies.extract(request);
    // A duplicated cookie is ambiguous — refuse rather than guess which token is
    // authoritative.
    if (ambiguous || token === undefined) {
      throw new UnauthorizedException();
    }

    const result = await this.resolver.resolve(token);
    if (result.kind === 'account_not_active') {
      await this.audit.accessRejected(result.adminId);
      throw new UnauthorizedException();
    }
    if (result.kind !== 'ok') {
      throw new UnauthorizedException();
    }

    this.requestContext.bindActor(createAdminActor(result.session.adminId));
    request.staffSession = result.session;
    return true;
  }
}
