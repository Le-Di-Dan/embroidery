import { loadStaffAuthConfig, normalizeOrigin } from './staff-auth.config';

describe('loadStaffAuthConfig', () => {
  it('applies the ADR defaults when nothing is set', () => {
    const config = loadStaffAuthConfig({ NODE_ENV: 'test' });
    expect(config.idleTimeoutMs).toBe(30 * 60 * 1000);
    expect(config.absoluteTimeoutMs).toBe(12 * 60 * 60 * 1000);
    expect(config.passwordMinLength).toBe(12);
    expect(config.identifierRateLimit).toEqual({ max: 5, windowMs: 15 * 60 * 1000 });
    expect(config.ipRateLimit.max).toBe(20);
    expect(config.globalRateLimit).toEqual({ max: 100, windowMs: 5 * 60 * 1000 });
    expect(config.cookieSecure).toBe(false);
    expect(config.allowedOrigins).toEqual([]);
  });

  it('defaults the cookie to Secure in production', () => {
    expect(loadStaffAuthConfig({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });

  it('fails fast when the production cookie is explicitly not Secure', () => {
    expect(() =>
      loadStaffAuthConfig({ NODE_ENV: 'production', STAFF_SESSION_COOKIE_SECURE: 'false' }),
    ).toThrow(/must be true in production/);
  });

  it('rejects an out-of-range numeric value', () => {
    expect(() =>
      loadStaffAuthConfig({ NODE_ENV: 'test', STAFF_LOGIN_RATE_LIMIT_IP_MAX: '0' }),
    ).toThrow(/expected an integer >= 1/);
  });

  it('normalizes and de-duplicates the allowed-origin list', () => {
    const config = loadStaffAuthConfig({
      NODE_ENV: 'test',
      STAFF_ALLOWED_ORIGINS: 'http://admin.embroidery.local:80 , http://admin.embroidery.local',
    });
    expect(config.allowedOrigins).toEqual(['http://admin.embroidery.local']);
  });

  it('rejects a malformed allowed-origin entry', () => {
    expect(() =>
      loadStaffAuthConfig({ NODE_ENV: 'test', STAFF_ALLOWED_ORIGINS: 'not-a-url' }),
    ).toThrow(/Invalid STAFF_ALLOWED_ORIGINS/);
  });
});

describe('normalizeOrigin', () => {
  it('accepts a bare origin and rejects one with a path', () => {
    expect(normalizeOrigin('https://x.test')).toBe('https://x.test');
    expect(normalizeOrigin('https://x.test/path')).toBeUndefined();
  });
});
