import { CookiePolicyService } from './cookie-policy.service';
import type { StaffAuthConfig } from '../../config/staff-auth.config';

function config(overrides: Partial<StaffAuthConfig> = {}): StaffAuthConfig {
  return {
    environment: 'test',
    cookieSecure: false,
    idleTimeoutMs: 30 * 60 * 1000,
    absoluteTimeoutMs: 12 * 60 * 60 * 1000,
    passwordMinLength: 12,
    identifierRateLimit: { max: 5, windowMs: 1000 },
    ipRateLimit: { max: 20, windowMs: 1000 },
    globalRateLimit: { max: 100, windowMs: 1000 },
    allowedOrigins: [],
    ...overrides,
  };
}

describe('CookiePolicyService', () => {
  it('uses the __Host- name and Secure in production mode', () => {
    const service = new CookiePolicyService(config({ cookieSecure: true }));
    expect(service.cookieName).toBe('__Host-adm_session');
    const cookie = service.serializeSessionCookie('rawtoken');
    expect(cookie).toContain('__Host-adm_session=rawtoken');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).toContain('Max-Age=43200');
  });

  it('uses the unprefixed name without Secure in development', () => {
    const service = new CookiePolicyService(config({ cookieSecure: false }));
    expect(service.cookieName).toBe('adm_session');
    const cookie = service.serializeSessionCookie('rawtoken');
    expect(cookie).toContain('adm_session=rawtoken');
    expect(cookie).not.toContain('Secure');
  });

  it('deletes with matching attributes and Max-Age=0', () => {
    const service = new CookiePolicyService(config({ cookieSecure: true }));
    const cookie = service.serializeDeletionCookie();
    expect(cookie).toContain('__Host-adm_session=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });

  it('extracts a single cookie value', () => {
    const service = new CookiePolicyService(config());
    const result = service.extract({ headers: { cookie: 'other=1; adm_session=tok123; a=b' } });
    expect(result).toEqual({ token: 'tok123', ambiguous: false });
  });

  it('reports no token when the cookie is absent', () => {
    const service = new CookiePolicyService(config());
    expect(service.extract({ headers: {} })).toEqual({ token: undefined, ambiguous: false });
    expect(service.extract({ headers: { cookie: 'x=1' } })).toEqual({
      token: undefined,
      ambiguous: false,
    });
  });

  it('flags a duplicated cookie with differing values as ambiguous', () => {
    const service = new CookiePolicyService(config());
    const result = service.extract({ headers: { cookie: 'adm_session=a; adm_session=b' } });
    expect(result.ambiguous).toBe(true);
    expect(result.token).toBeUndefined();
  });
});
