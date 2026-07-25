import { ResolveStaffSessionService } from './resolve-staff-session.service';
import type { StaffClock } from './ports/staff-clock';
import { SessionTokenService } from '../infrastructure/crypto/session-token.service';
import type {
  AdminAccount,
  AdminAccountRepository,
} from '../domain/repositories/admin-account.repository';
import type {
  AdminSession,
  AdminSessionId,
  AdminSessionRepository,
} from '../domain/repositories/admin-session.repository';
import type { StaffAuthConfig } from '../config/staff-auth.config';

const IDLE = 30 * 60 * 1000;
const ABSOLUTE = 12 * 60 * 60 * 1000;

const CONFIG = {
  idleTimeoutMs: IDLE,
  absoluteTimeoutMs: ABSOLUTE,
} as StaffAuthConfig;

function fixedClock(ms: number): StaffClock {
  return { now: () => new Date(ms) };
}

function account(status: AdminAccount['status'] = 'ACTIVE'): AdminAccount {
  return {
    id: 'admin-1' as AdminAccount['id'],
    email: 'ops@example.test',
    displayName: 'Ops',
    status,
    lockedAt: undefined,
    disabledAt: undefined,
    replacedByAdminAccountId: undefined,
    createdAt: new Date(0),
  };
}

function session(overrides: Partial<AdminSession>): AdminSession {
  return {
    id: 'sess-1' as AdminSessionId,
    adminAccountId: 'admin-1' as AdminAccount['id'],
    status: 'ACTIVE',
    expiresAt: new Date(IDLE),
    revokedAt: undefined,
    createdAt: new Date(0),
    ...overrides,
  };
}

interface Harness {
  service: ResolveStaffSessionService;
  extend: jest.Mock;
}

function harness(options: {
  session: AdminSession | undefined;
  account?: AdminAccount | undefined;
  now: number;
}): Harness {
  const tokens = new SessionTokenService();
  const extend = jest.fn(() => Promise.resolve(options.session));
  const sessions = {
    // Mimic the repository: return the session only while live and unexpired.
    findActiveByTokenHash: (_hash: string, now: Date) =>
      Promise.resolve(
        options.session !== undefined &&
          options.session.status === 'ACTIVE' &&
          options.session.expiresAt.getTime() > now.getTime()
          ? options.session
          : undefined,
      ),
    extendExpiry: extend,
  } as unknown as AdminSessionRepository;
  const accounts = {
    findById: () => Promise.resolve(options.account),
  } as unknown as AdminAccountRepository;
  const service = new ResolveStaffSessionService(
    sessions,
    accounts,
    tokens,
    fixedClock(options.now),
    CONFIG,
  );
  return { service, extend };
}

describe('ResolveStaffSessionService', () => {
  it('resolves a live session for an active account', async () => {
    const { service } = harness({ session: session({}), account: account(), now: 1000 });
    const result = await service.resolve('raw');
    expect(result).toEqual({
      kind: 'ok',
      session: {
        sessionId: 'sess-1',
        adminId: 'admin-1',
        email: 'ops@example.test',
        displayName: 'Ops',
      },
    });
  });

  it('returns invalid when the session is missing or idle-expired', async () => {
    const missing = harness({ session: undefined, account: account(), now: 1000 });
    expect((await missing.service.resolve('raw')).kind).toBe('invalid');

    const expired = harness({
      session: session({ expiresAt: new Date(500) }),
      account: account(),
      now: 1000,
    });
    expect((await expired.service.resolve('raw')).kind).toBe('invalid');
  });

  it('returns invalid past the absolute timeout even if idle expiry is far off', async () => {
    const { service } = harness({
      session: session({ createdAt: new Date(0), expiresAt: new Date(ABSOLUTE + IDLE) }),
      account: account(),
      now: ABSOLUTE + 1,
    });
    expect((await service.resolve('raw')).kind).toBe('invalid');
  });

  it('reports account_not_active for a disabled account with a live session', async () => {
    const { service } = harness({
      session: session({}),
      account: account('DISABLED'),
      now: 1000,
    });
    expect(await service.resolve('raw')).toEqual({
      kind: 'account_not_active',
      adminId: 'admin-1',
      sessionId: 'sess-1',
    });
  });

  it('does not slide expiry before the half-idle threshold', async () => {
    const { service, extend } = harness({
      session: session({ expiresAt: new Date(IDLE) }),
      account: account(),
      // Plenty of idle window remains.
      now: 1000,
    });
    await service.resolve('raw');
    expect(extend).not.toHaveBeenCalled();
  });

  it('slides expiry once past the half-idle threshold, capped at absolute', async () => {
    const now = IDLE; // well within the absolute window
    const { service, extend } = harness({
      // Only a quarter-idle remains, so renewal fires.
      session: session({ createdAt: new Date(0), expiresAt: new Date(now + IDLE / 4) }),
      account: account(),
      now,
    });
    await service.resolve('raw');
    expect(extend).toHaveBeenCalledTimes(1);
    const [, newExpiry] = extend.mock.calls[0] as [unknown, Date];
    expect(newExpiry.getTime()).toBe(now + IDLE);
    expect(newExpiry.getTime()).toBeLessThanOrEqual(ABSOLUTE);
  });

  it('caps a slide at the absolute expiry', async () => {
    const now = ABSOLUTE - IDLE / 4; // near the ceiling
    const { service, extend } = harness({
      session: session({ createdAt: new Date(0), expiresAt: new Date(now + IDLE / 8) }),
      account: account(),
      now,
    });
    await service.resolve('raw');
    // nextExpiry would be now+IDLE but is capped at ABSOLUTE.
    const [, newExpiry] = extend.mock.calls[0] as [unknown, Date];
    expect(newExpiry.getTime()).toBe(ABSOLUTE);
  });
});
