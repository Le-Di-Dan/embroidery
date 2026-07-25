import { RequestOriginPolicy } from './request-origin.policy';
import {
  loadStaffAuthConfig,
  normalizeOrigin,
  type StaffAuthConfig,
} from '../../config/staff-auth.config';

function policy(allowedOrigins: string[]): RequestOriginPolicy {
  const config = {
    ...loadStaffAuthConfig({ NODE_ENV: 'test' }),
    allowedOrigins,
  } as StaffAuthConfig;
  return new RequestOriginPolicy(config);
}

const ADMIN = 'http://admin.embroidery.local';

describe('RequestOriginPolicy — origin', () => {
  it('allows an absent origin (non-browser request)', () => {
    expect(policy([ADMIN]).isAllowedOrigin({ headers: {} })).toBe(true);
  });

  it('allows an exact allowlisted origin', () => {
    expect(policy([ADMIN]).isAllowedOrigin({ headers: { origin: ADMIN } })).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(policy([ADMIN]).isAllowedOrigin({ headers: { origin: 'http://evil.test' } })).toBe(
      false,
    );
  });

  it('rejects the literal null origin', () => {
    expect(policy([ADMIN]).isAllowedOrigin({ headers: { origin: 'null' } })).toBe(false);
  });

  it('does not match a suffix or sibling origin', () => {
    const p = policy([ADMIN]);
    expect(
      p.isAllowedOrigin({ headers: { origin: 'http://admin.embroidery.local.evil.test' } }),
    ).toBe(false);
    expect(p.isAllowedOrigin({ headers: { origin: 'http://evil-admin.embroidery.local' } })).toBe(
      false,
    );
  });

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(policy([ADMIN]).isAllowedOrigin({ headers: { referer: `${ADMIN}/login` } })).toBe(true);
  });
});

describe('RequestOriginPolicy — content type', () => {
  it('accepts application/json with and without a charset', () => {
    const p = policy([]);
    expect(p.isJsonContentType({ headers: { 'content-type': 'application/json' } })).toBe(true);
    expect(
      p.isJsonContentType({ headers: { 'content-type': 'application/json; charset=utf-8' } }),
    ).toBe(true);
  });

  it('rejects non-JSON and missing content types', () => {
    const p = policy([]);
    expect(
      p.isJsonContentType({ headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
    ).toBe(false);
    expect(p.isJsonContentType({ headers: {} })).toBe(false);
  });
});

describe('normalizeOrigin', () => {
  it('drops default ports and lowercases the host', () => {
    expect(normalizeOrigin('HTTP://Admin.Embroidery.Local:80')).toBe(
      'http://admin.embroidery.local',
    );
    expect(normalizeOrigin('https://x.test:443/')).toBe('https://x.test');
  });

  it('rejects an origin carrying a path or credentials', () => {
    expect(normalizeOrigin('http://x.test/a')).toBeUndefined();
    expect(normalizeOrigin('http://u:p@x.test')).toBeUndefined();
    expect(normalizeOrigin('not a url')).toBeUndefined();
  });
});
