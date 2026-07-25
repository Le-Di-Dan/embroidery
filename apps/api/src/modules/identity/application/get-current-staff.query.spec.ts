import { GetCurrentStaffQuery } from './get-current-staff.query';
import type { ResolvedStaffSession } from './resolve-staff-session.service';

function session(overrides: Partial<ResolvedStaffSession> = {}): ResolvedStaffSession {
  return {
    sessionId: 'sess-internal-1',
    adminId: 'admin-1',
    email: 'ops@example.test',
    displayName: 'Operator',
    ...overrides,
  };
}

describe('GetCurrentStaffQuery', () => {
  const query = new GetCurrentStaffQuery();

  it('projects exactly the three public fields', () => {
    const view = query.execute(session());
    expect(view).toEqual({ id: 'admin-1', email: 'ops@example.test', displayName: 'Operator' });
  });

  it('never leaks the internal session reference or any other field', () => {
    const view = query.execute(session());
    expect(Object.keys(view).sort()).toEqual(['displayName', 'email', 'id']);
    expect(view as unknown as Record<string, unknown>).not.toHaveProperty('sessionId');
    expect(view as unknown as Record<string, unknown>).not.toHaveProperty('adminId');
  });

  it('preserves a Unicode display name unchanged', () => {
    const view = query.execute(session({ displayName: 'Nguyễn An' }));
    expect(view.displayName).toBe('Nguyễn An');
  });

  it('preserves the stored normalized email unchanged', () => {
    const view = query.execute(session({ email: 'admin+ops@example.test' }));
    expect(view.email).toBe('admin+ops@example.test');
  });

  it('produces a fresh object that does not alias the resolved session', () => {
    const source = session();
    const view: unknown = query.execute(source);
    expect(view).not.toBe(source);
  });
});
