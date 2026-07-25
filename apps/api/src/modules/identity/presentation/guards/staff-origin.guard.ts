/**
 * Origin allowlist guard for staff session mutations (ADR-APP1-001 §6).
 *
 * Rejects a browser cross-site request with 403 before any work runs. An absent
 * origin is treated as non-browser and permitted by the policy; a foreign or
 * `null` origin is refused. Applied to both login and logout.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { RequestOriginPolicy } from '../../infrastructure/http/request-origin.policy';

@Injectable()
export class StaffOriginGuard implements CanActivate {
  constructor(private readonly policy: RequestOriginPolicy) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    if (!this.policy.isAllowedOrigin(request)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Request origin is not allowed.',
      });
    }
    return true;
  }
}
