/**
 * `@CurrentStaff()` — the authenticated staff projection, for guarded handlers
 * (APP1-B02).
 *
 * It reads only what the `AuthenticatedAdminGuard` attached after verifying a
 * live session; it never parses a header, body or query, so a client cannot
 * fabricate an identity. Absence means the decorator was used without the guard
 * — a programming error — and it fails closed with 401 rather than handing a
 * controller an undefined identity.
 */
import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { ResolvedStaffSession } from '../application/resolve-staff-session.service';
import type { StaffAuthenticatedRequest } from './staff-request';

/** Extracts the guard-attached session, or fails closed when it is absent. */
export function currentStaffOf(context: ExecutionContext): ResolvedStaffSession {
  const request = context.switchToHttp().getRequest<StaffAuthenticatedRequest>();
  const session = request.staffSession;
  if (session === undefined) {
    throw new UnauthorizedException();
  }
  return session;
}

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedStaffSession => currentStaffOf(context),
);
