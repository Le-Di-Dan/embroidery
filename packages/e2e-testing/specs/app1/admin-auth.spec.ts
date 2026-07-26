/**
 * E01-J02/J03/J05 — Admin routing, login + current-staff identity, and logout,
 * end-to-end through the real gateway → Next → Nest → PostgreSQL, with the real
 * `adm_session` cookie. No API shortcut and no cookie injection: every session
 * transition is driven by the browser.
 *
 * A password is never written to the URL or a log; only the field receives it.
 */
import { test, expect, assertNoAppErrors } from './support/app1-test';
import { loginAsAdmin, logout, submitLogin, LOGIN, SHELL } from './support/admin-auth';
import { fetchJsonInPage } from '../support/smoke-test';

const LOGIN_HEADING = 'Đăng nhập';

test.describe('admin routing / login / logout (E01-J02/J03/J05)', () => {
  test('anonymous route matrix redirects protected routes to /login', async ({
    page,
    appErrors,
  }) => {
    // Protected home → /login.
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toBeVisible();

    // /login itself renders (no redirect loop).
    await page.goto('/login');
    expect(new URL(page.url()).pathname).toBe('/login');

    // An unknown protected route also lands on /login (cookie-presence policy).
    await page.goto('/does-not-exist-yet');
    expect(new URL(page.url()).pathname).toBe('/login');

    // Infra paths excluded from the proxy matcher are never redirected.
    const health = await fetchJsonInPage(page, '/healthz');
    expect(health.status).toBe(200);
    expect((health.body as { service?: string }).service).toBe('admin');

    assertNoAppErrors(appErrors);
  });

  test('login yields the shell, correct cookie, matching identity, and persistence', async ({
    page,
    context,
    admin,
    appErrors,
  }) => {
    // The shell is server-seeded, so a protected navigation makes exactly one
    // (server-side) current-staff call and zero on the client — no mount
    // duplication. Count any client-side call to prove it.
    let clientMeCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/staff/me')) clientMeCalls += 1;
    });

    await loginAsAdmin(page, admin);
    expect(clientMeCalls, 'no duplicate client-side current-staff call on load').toBe(0);

    // Cookie contract: dev name, HttpOnly, SameSite=Strict, Path=/, host-only,
    // no Secure over dev HTTP.
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'adm_session');
    expect(session, 'adm_session cookie present').toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Strict');
    expect(session?.path).toBe('/');
    expect(session?.secure).toBe(false);
    expect(session?.domain).toBe('admin.embroidery.local'); // host-only (no leading dot)

    // Identity in the UI matches the API, and the contract is exactly id/email/displayName.
    await expect(page.getByText(admin.displayName, { exact: false })).toBeVisible();
    const me = await fetchJsonInPage(page, '/api/staff/me');
    expect(me.status).toBe(200);
    const data = (me.body as { data: Record<string, unknown> }).data;
    expect(data.email).toBe(admin.email);
    expect(data.displayName).toBe(admin.displayName);
    expect(Object.keys(data).sort()).toEqual(['displayName', 'email', 'id']);

    // Refresh stays authenticated.
    await page.reload();
    await expect(page.getByRole('button', { name: SHELL.logoutName })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');

    // /login while authenticated redirects to the authenticated home.
    await page.goto('/login');
    expect(new URL(page.url()).pathname).toBe('/');

    // Logout → /login; then the protected home is gated again and /login stays available.
    await logout(page);
    expect(new URL(page.url()).pathname).toBe('/login');
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toBeVisible();

    assertNoAppErrors(appErrors);
  });

  test('invalid credentials show a generic error with no enumeration or URL leak', async ({
    page,
    admin,
  }) => {
    const wrongPassword = 'wrong-password-000000';

    // Wrong password for the real admin.
    await page.goto('/login');
    await submitLogin(page, admin.email, wrongPassword);
    await expect(page.getByText(LOGIN.authAlert)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');

    // Unknown account → identical generic message (no account enumeration).
    await page.goto('/login');
    await submitLogin(page, `nobody-${Date.now()}@e2e.example.test`, wrongPassword);
    await expect(page.getByText(LOGIN.authAlert)).toBeVisible();

    // Credentials never appear in the URL and there is no native GET fallback.
    const url = new URL(page.url());
    expect(url.search).toBe('');
    expect(page.url()).not.toContain(admin.email);
    expect(page.url()).not.toContain(wrongPassword);
  });
});
