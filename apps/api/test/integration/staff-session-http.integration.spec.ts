/**
 * APP1-B01 staff session HTTP flow, end to end through the real AppModule on a
 * disposable PostgreSQL database (T01). Proves login, logout, the authenticated
 * guard, enumeration-safe failures, CSRF/content-type policy, rate limiting, the
 * lock cascade, audit actor binding and log redaction.
 */
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { StaffAccountStatusService } from '../../src/modules/identity/application/staff-account-status.service';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../src/modules/audit/domain/repositories/audit-event.repository';
import type { AdminAccountId } from '../../src/modules/identity/domain/repositories/admin-account.repository';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'ops@example.test';
const PASSWORD = 'operator-secret-123';

describe('staff session HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let adminId: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('b01-http');
    const bootstrap = ctx.app.get(BootstrapStaffUseCase);
    const result = await bootstrap.bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Operator',
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

  function login(body: object) {
    return ctx.http.post('/api/staff/session').set('Origin', ADMIN_ORIGIN).send(body);
  }

  interface ErrorBody {
    code?: string;
    message?: string;
    errors?: Array<{ field: string; code: string; message: string }>;
  }

  function body(res: { body: unknown }): ErrorBody {
    return res.body as ErrorBody;
  }

  function setCookies(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers['set-cookie'];
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  function cookieValue(cookies: string[]): string {
    const header = cookies.find((c) => c.startsWith('adm_session='));
    if (header === undefined) {
      throw new Error('No adm_session cookie was set.');
    }
    return header.split(';', 1)[0] ?? '';
  }

  it('logs in and sets a hardened session cookie, then logs out', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const cookies = setCookies(res);
    const raw = cookies.find((c) => c.startsWith('adm_session='));
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/');
    expect(raw).not.toContain('Secure'); // dev cookie
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = cookieValue(cookies);
    const out = await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(setCookies(out)[0]).toContain('Max-Age=0');

    // The revoked cookie no longer authenticates.
    const after = await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('records a login.succeeded audit event with the ADMIN actor', async () => {
    await login({ email: EMAIL, password: PASSWORD });
    const audit = ctx.app.get<AuditEventRepository>(AUDIT_EVENT_REPOSITORY);
    const events = await audit.listByTarget('ADMIN_ACCOUNT', adminId);
    const success = events.find((e) => e.action === 'staff.login.succeeded');
    expect(success?.actorKind).toBe('ADMIN');
  });

  it('fails uniformly for a wrong password and an unknown account (no enumeration)', async () => {
    const wrong = await login({ email: EMAIL, password: 'wrong-password-000' });
    const unknown = await login({ email: 'nobody@example.test', password: 'wrong-password-000' });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(body(res).code).toBe('STAFF_LOGIN_FAILED');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    // Identical public shape (the correlation id in meta legitimately differs).
    expect(body(wrong).message).toBe(body(unknown).message);
    expect(body(wrong).errors).toEqual(body(unknown).errors);
  });

  it('returns 400 with stable field errors for a malformed body (FU-A03)', async () => {
    const res = await login({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(body(res).code).toBe('BAD_REQUEST');
    const fields = (body(res).errors ?? []).map((e) => e.field);
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('rejects a non-JSON login body with 415', async () => {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('email=x');
    expect(res.status).toBe(415);
    expect(body(res).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a disallowed origin with 403', async () => {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', 'http://evil.test')
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rejects logout without a cookie or with a garbage cookie as 401', async () => {
    const none = await ctx.http.delete('/api/staff/session').set('Origin', ADMIN_ORIGIN);
    expect(none.status).toBe(401);
    const garbage = await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', 'adm_session=not-a-real-token');
    expect(garbage.status).toBe(401);
  });

  it('rate-limits repeated attempts on one identifier with a Retry-After', async () => {
    // Reset so prior tests' counters do not interfere.
    ctx.app.get(LoginRateLimiter).reset();
    const email = 'burst@example.test';
    let limited: Awaited<ReturnType<typeof login>> | undefined;
    for (let i = 0; i < 6; i += 1) {
      const res = await login({ email, password: 'wrong-password-000' });
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited?.status).toBe(429);
    expect(limited === undefined ? undefined : body(limited).code).toBe('TOO_MANY_REQUESTS');
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('never writes the raw token or password to the log sink', async () => {
    await login({ email: EMAIL, password: PASSWORD });
    const serialized = JSON.stringify(ctx.logs.records);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized.toLowerCase()).not.toContain('set-cookie');
  });
});

describe('staff session lock cascade (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('b01-cascade');
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  });

  it('revokes live sessions and refuses login once the account is disabled', async () => {
    const bootstrap = ctx.app.get(BootstrapStaffUseCase);
    const { adminId } = await bootstrap.bootstrap({
      email: 'lock@example.test',
      password: PASSWORD,
      displayName: 'Locked Op',
      rotate: false,
    });

    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'lock@example.test', password: PASSWORD });
    const rawCookies = res.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookies) ? (rawCookies as string[]) : [])
      .find((c) => c.startsWith('adm_session='))
      ?.split(';', 1)[0];

    const status = ctx.app.get(StaffAccountStatusService);
    await status.changeStatus(adminId as AdminAccountId, 'DISABLED', 'test-correlation');

    // The previously live session is now rejected.
    const afterDisable = await ctx.http
      .delete('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', cookie ?? '');
    expect(afterDisable.status).toBe(401);

    // A correct password against a disabled account still fails uniformly.
    const relogin = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'lock@example.test', password: PASSWORD });
    expect(relogin.status).toBe(401);
    expect((relogin.body as { code?: string }).code).toBe('STAFF_LOGIN_FAILED');
  });
});
