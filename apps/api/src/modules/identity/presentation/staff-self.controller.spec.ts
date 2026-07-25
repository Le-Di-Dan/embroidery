import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { StaffSelfController } from './staff-self.controller';
import { GetCurrentStaffQuery } from '../application/get-current-staff.query';
import type { ResolvedStaffSession } from '../application/resolve-staff-session.service';

const SESSION: ResolvedStaffSession = {
  sessionId: 'sess-1',
  adminId: 'admin-1',
  email: 'ops@example.test',
  displayName: 'Operator',
};

describe('StaffSelfController', () => {
  it('returns the query projection unchanged and touches no other collaborator', () => {
    const query = new GetCurrentStaffQuery();
    const controller = new StaffSelfController(query);

    const result = controller.get(SESSION);

    expect(result).toEqual({
      id: 'admin-1',
      email: 'ops@example.test',
      displayName: 'Operator',
    });
  });
});

describe('StaffSelfController source boundary', () => {
  const source = readFileSync(join(__dirname, 'staff-self.controller.ts'), 'utf8');

  it('does not parse the cookie or hash a token itself', () => {
    // ApiCookieAuth (Swagger) is fine; extracting/parsing a cookie is not.
    expect(source).not.toMatch(/CookiePolicyService|\.extract\(/);
    expect(source).not.toMatch(/tokenHash|\.hash\(/);
  });

  it('performs no repository or session lookup', () => {
    expect(source).not.toMatch(/Repository/);
    expect(source).not.toMatch(/\.resolve\(/);
    expect(source).not.toMatch(/findBy|findActive/);
  });

  it('never rewrites the session cookie on a read', () => {
    expect(source).not.toMatch(/Set-Cookie/i);
    expect(source).not.toMatch(/serializeSessionCookie|serializeDeletionCookie/);
  });

  it('reads the identity through the @CurrentStaff decorator', () => {
    expect(source).toMatch(/@CurrentStaff\(\)/);
  });

  it('is protected by the authenticated-admin guard', () => {
    expect(source).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
  });

  it('declares Cache-Control: no-store', () => {
    expect(source).toMatch(/@Header\('Cache-Control', 'no-store'\)/);
  });
});
