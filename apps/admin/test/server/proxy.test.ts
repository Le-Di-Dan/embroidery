/**
 * @jest-environment node
 *
 * Fast cookie-presence routing in the Next.js proxy: unauthenticated protected
 * routes redirect to `/login`, `/login` is always allowed, cookie-bearing
 * requests pass through for authoritative server validation, and the matcher
 * excludes static assets so they are never redirected.
 */
import { NextRequest } from 'next/server';

import { config, proxy } from '../../src/proxy';

const ORIGIN = 'http://admin.embroidery.local';

function request(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

describe('admin request proxy', () => {
  it('redirects an anonymous protected route to /login', () => {
    const res = proxy(request('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
  });

  it('allows /login without a session cookie', () => {
    const res = proxy(request('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows /login even with a stale session cookie (no loop)', () => {
    const res = proxy(request('/login', 'adm_session=stale'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes a protected route through when the dev cookie is present', () => {
    const res = proxy(request('/', 'adm_session=opaque'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes a protected route through when the production cookie is present', () => {
    const res = proxy(request('/', '__Host-adm_session=opaque'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects a nested protected route when no cookie is present', () => {
    const res = proxy(request('/reports/monthly'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
  });
});

describe('proxy matcher', () => {
  // Faithful reconstruction of the single configured negative-lookahead pattern.
  const compiled = new RegExp(`^${config.matcher[0] as string}$`);

  it('exposes a single matcher entry', () => {
    expect(config.matcher).toHaveLength(1);
  });

  it.each(['/', '/login', '/reports'])('matches application route %s', (path) => {
    expect(compiled.test(path)).toBe(true);
  });

  it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/healthz'])(
    'excludes static/internal path %s',
    (path) => {
      expect(compiled.test(path)).toBe(false);
    },
  );
});
