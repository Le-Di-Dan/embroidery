import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { currentStaffOf } from './current-staff.decorator';
import type { ResolvedStaffSession } from '../application/resolve-staff-session.service';
import type { StaffAuthenticatedRequest } from './staff-request';

function contextFor(request: StaffAuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const SESSION: ResolvedStaffSession = {
  sessionId: 'sess-1',
  adminId: 'admin-1',
  email: 'ops@example.test',
  displayName: 'Operator',
};

describe('currentStaffOf', () => {
  it('returns the projection the guard attached', () => {
    const context = contextFor({ headers: {}, staffSession: SESSION });
    expect(currentStaffOf(context)).toBe(SESSION);
  });

  it('fails closed with 401 when no guard populated the request', () => {
    const context = contextFor({ headers: {} });
    expect(() => currentStaffOf(context)).toThrow(UnauthorizedException);
  });

  it('cannot be fabricated from request headers', () => {
    // A client-supplied header must never become an identity.
    const context = contextFor({
      headers: { 'x-staff-session': JSON.stringify(SESSION) },
    });
    expect(() => currentStaffOf(context)).toThrow(UnauthorizedException);
  });
});
