/**
 * APP1-B02 current-staff HTTP flow, end to end through the real AppModule on a
 * disposable PostgreSQL database (T01). Proves GET /api/staff/me: the safe
 * identity projection, sliding renewal on an ordinary read, the negative
 * 401 matrix, cache/audit behaviour and B01 regressions.
 */
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { StaffAccountStatusService } from '../../src/modules/identity/application/staff-account-status.service';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import { SessionTokenService } from '../../src/modules/identity/infrastructure/crypto/session-token.service';
import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSession,
  type AdminSessionRepository,
} from '../../src/modules/identity/domain/repositories/admin-session.repository';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../src/modules/audit/domain/repositories/audit-event.repository';
import type { AdminAccountId } from '../../src/modules/identity/domain/repositories/admin-account.repository';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'me@example.test';
const PASSWORD = 'operator-secret-123';
const DISPLAY_NAME = 'Nguyễn An';
const IDLE_MS = 30 * 60 * 1000;

function rawTokenOf(cookie: string): string {
  return cookie.slice('adm_session='.length);
}

describe('current staff HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let adminId: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('b02-self');
    const bootstrap = ctx.app.get(BootstrapStaffUseCase);
    const result = await bootstrap.bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      rotate: false,
    });
    adminId = result.adminId;
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  });

  beforeEach(() => {
    ctx.app.get(LoginRateLimiter).reset();
  });

  function setCookies(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers['set-cookie'];
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  async function loginCookie(): Promise<string> {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(204);
    const header = setCookies(res).find((c) => c.startsWith('adm_session='));
    if (header === undefined) {
      throw new Error('login set no adm_session cookie');
    }
    return header.split(';', 1)[0] ?? '';
  }

  function getMe(cookie: string | undefined) {
    const req = ctx.http.get('/api/staff/me');
    return cookie === undefined ? req : req.set('Cookie', cookie);
  }

  async function findSession(cookie: string): Promise<AdminSession> {
    const tokens = ctx.app.get(SessionTokenService);
    const sessions = ctx.app.get<AdminSessionRepository>(ADMIN_SESSION_REPOSITORY);
    const hash = tokens.hash(rawTokenOf(cookie));
    const session = await sessions.findActiveByTokenHash(hash, new Date());
    if (session === undefined) {
      throw new Error('expected a live session for the cookie');
    }
    return session;
  }

  interface SelfBody {
    success?: boolean;
    code?: string;
    message?: string;
    data?: { id?: string; email?: string; displayName?: string };
    meta?: { requestId?: string; timestamp?: string };
  }

  it('returns the safe current-staff identity with the canonical envelope', async () => {
    const cookie = await loginCookie();
    const res = await getMe(cookie);

    expect(res.status).toBe(200);
    const body = res.body as SelfBody;
    expect(body.success).toBe(true);
    expect(body.code).toBe('STAFF_SELF_READ');
    expect(body.message).toBe('Current staff retrieved.');
    expect(body.data).toEqual({ id: adminId, email: EMAIL, displayName: DISPLAY_NAME });
    // Exactly the three public fields — no credential/session/role leak.
    expect(Object.keys(body.data ?? {}).sort()).toEqual(['displayName', 'email', 'id']);
    expect(typeof body.meta?.requestId).toBe('string');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('creates no audit event for an ordinary successful read', async () => {
    const audit = ctx.app.get<AuditEventRepository>(AUDIT_EVENT_REPOSITORY);
    const cookie = await loginCookie();
    const before = await audit.listByTarget('ADMIN_ACCOUNT', adminId);
    await getMe(cookie).expect(200);
    const after = await audit.listByTarget('ADMIN_ACCOUNT', adminId);
    expect(after.length).toBe(before.length);
  });

  it('does not slide idle expiry before the half-idle threshold', async () => {
    const cookie = await loginCookie();
    const before = await findSession(cookie);
    // Fresh session: ~30 min of idle window remains, well above the 15-min threshold.
    await getMe(cookie).expect(200);
    const after = await findSession(cookie);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it('slides idle expiry exactly once past the threshold, capped at absolute', async () => {
    const cookie = await loginCookie();
    const sessions = ctx.app.get<AdminSessionRepository>(ADMIN_SESSION_REPOSITORY);
    const original = await findSession(cookie);
    // Pull the idle expiry inside the half-idle window so the next read renews it.
    const narrowed = new Date(Date.now() + 10 * 60 * 1000);
    await sessions.extendExpiry(original.id, narrowed);

    await getMe(cookie).expect(200);

    const renewed = await findSession(cookie);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(narrowed.getTime());
    // Renewed to ~now + idle window, and never beyond the absolute ceiling.
    const absoluteCeiling = original.createdAt.getTime() + 12 * 60 * 60 * 1000;
    expect(renewed.expiresAt.getTime()).toBeLessThanOrEqual(absoluteCeiling);
    expect(renewed.expiresAt.getTime() - Date.now()).toBeGreaterThan(IDLE_MS - 60 * 1000);
  });

  it('rejects a missing, malformed, unknown or duplicate cookie with 401', async () => {
    const missing = await getMe(undefined);
    const malformed = await getMe('adm_session=not-a-real-token');
    const unknown = await getMe('adm_session=AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH');
    const duplicate = await getMe('adm_session=a; adm_session=b');
    for (const res of [missing, malformed, unknown, duplicate]) {
      expect(res.status).toBe(401);
      const body = res.body as SelfBody;
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.data).toBeUndefined();
    }
  });

  it('rejects a revoked session (after logout) with 401', async () => {
    const cookie = await loginCookie();
    await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', cookie)
      .expect(204);
    await getMe(cookie).expect(401);
  });

  it('rejects an idle-expired session with 401', async () => {
    const cookie = await loginCookie();
    const sessions = ctx.app.get<AdminSessionRepository>(ADMIN_SESSION_REPOSITORY);
    const session = await findSession(cookie);
    await sessions.extendExpiry(session.id, new Date(Date.now() - 1000));
    await getMe(cookie).expect(401);
  });

  it('rejects an absolute-expired session with 401', async () => {
    const cookie = await loginCookie();
    const session = await findSession(cookie);
    // Backdate creation beyond the 12-hour absolute ceiling; idle expiry stays live.
    await ctx.database.client.pool.query(
      'UPDATE admin_sessions SET created_at = $1 WHERE id = $2',
      [new Date(Date.now() - 13 * 60 * 60 * 1000), session.id],
    );
    await getMe(cookie).expect(401);
  });

  it('never writes the raw token to the log sink on a read', async () => {
    const cookie = await loginCookie();
    await getMe(cookie).expect(200);
    const serialized = JSON.stringify(ctx.logs.records);
    expect(serialized).not.toContain(rawTokenOf(cookie));
    expect(serialized.toLowerCase()).not.toContain('set-cookie');
  });

  it('keeps B01 regressions: login 204, logout 204 then dead cookie, strict validation, health', async () => {
    const cookie = await loginCookie();
    const logout = await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);
    await getMe(cookie).expect(401);

    const invalid = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD, role: 'superadmin' });
    expect(invalid.status).toBe(400);
    expect((invalid.body as { code?: string }).code).toBe('BAD_REQUEST');

    await ctx.http.get('/api/health').expect(200);
  });
});

describe('current staff — locked account (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('b02-locked');
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  });

  it('rejects a live session whose account is locked with 401', async () => {
    const { adminId } = await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: 'locked@example.test',
      password: PASSWORD,
      displayName: 'Locked Op',
      rotate: false,
    });
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'locked@example.test', password: PASSWORD });
    const cookie = ((res.headers['set-cookie'] as unknown as string[]) ?? [])
      .find((c) => c.startsWith('adm_session='))
      ?.split(';', 1)[0];

    await ctx.app
      .get(StaffAccountStatusService)
      .changeStatus(adminId as AdminAccountId, 'LOCKED', 'test-locked');

    const me = await ctx.http.get('/api/staff/me').set('Cookie', cookie ?? '');
    expect(me.status).toBe(401);
    expect((me.body as { data?: unknown }).data).toBeUndefined();
  });
});

describe('current staff — disabled account (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('b02-disabled');
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  });

  it('rejects a live session whose account is disabled with 401', async () => {
    const { adminId } = await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: 'disabled@example.test',
      password: PASSWORD,
      displayName: 'Disabled Op',
      rotate: false,
    });
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'disabled@example.test', password: PASSWORD });
    const cookie = ((res.headers['set-cookie'] as unknown as string[]) ?? [])
      .find((c) => c.startsWith('adm_session='))
      ?.split(';', 1)[0];

    await ctx.app
      .get(StaffAccountStatusService)
      .changeStatus(adminId as AdminAccountId, 'DISABLED', 'test-disabled');

    const me = await ctx.http.get('/api/staff/me').set('Cookie', cookie ?? '');
    expect(me.status).toBe(401);
    expect((me.body as { data?: unknown }).data).toBeUndefined();
  });
});
