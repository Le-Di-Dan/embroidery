/**
 * E01-C1-J01 — Invalid/stale Admin cookie route matrix, end-to-end through the
 * real gateway → Next → Nest → PostgreSQL. A forged, syntactically valid but
 * semantically invalid `adm_session` cookie is installed in a fresh context so
 * the fast cookie-presence proxy allows the request through; authoritative
 * server validation (`GET /api/staff/me`) then rejects it (401), and the Admin
 * server redirects to `/login` — never treating cookie presence as
 * authentication, never looping, never flashing the shell or the expiry modal.
 *
 * The forged cookie value is never read by client code, never logged, and never
 * asserted against; only its presence (by name) and HttpOnly status are checked.
 */
import { test, expect, assertNoAppErrors } from './support/app1-test';
import { SHELL } from './support/admin-auth';
import { setForgedSessionCookie, assertSessionCookieHttpOnly } from './support/admin-cookie';
import { fetchJsonInPage } from '../support/smoke-test';

const LOGIN_HEADING = 'Đăng nhập';
const EXPIRY_MODAL = 'Phiên đăng nhập đã hết hạn';

test.describe('invalid/stale admin cookie route matrix (E01-C1-J01)', () => {
  test('a forged session cookie reaches authoritative 401 and lands on /login without looping', async ({
    page,
    context,
    baseURL,
    appErrors,
  }) => {
    expect(baseURL, 'admin base URL').toBeTruthy();
    await setForgedSessionCookie(context, baseURL as string);

    // Protected root: cookie-presence gate allows the request, the server
    // resolver gets a 401 from the API, and the browser lands on /login.
    const response = await page.goto('/');
    expect(new URL(page.url()).pathname, 'protected / with an invalid cookie lands on /login').toBe(
      '/login',
    );
    await expect(page.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toBeVisible();
    // The shell must never render for an invalid cookie, and no expiry modal.
    await expect(page.getByRole('button', { name: SHELL.logoutName })).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: EXPIRY_MODAL })).toHaveCount(0);

    // The forged cookie is present but HttpOnly — client code cannot read it.
    await assertSessionCookieHttpOnly(page, context);

    // Redirect chain is bounded (no loop): / → /login is a single hop.
    let redirects = 0;
    for (let r = response?.request().redirectedFrom() ?? null; r !== null; r = r.redirectedFrom()) {
      redirects += 1;
    }
    expect(redirects, 'bounded redirect chain (no loop)').toBeLessThanOrEqual(3);

    // Directly observe authoritative rejection through the real gateway + API:
    // the browser attaches the (HttpOnly) forged cookie; the API answers 401.
    const me = await fetchJsonInPage(page, '/api/staff/me');
    expect(me.status, 'authoritative current-staff validation rejects the forged cookie').toBe(401);

    // Login route with the same invalid cookie renders exactly once (no loop, no
    // redirect back to a protected route, no shell).
    await page.goto('/login');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: SHELL.logoutName })).toHaveCount(0);

    // Repeated navigation /login → / → /login stays stable: no loop, no shell
    // flash into the authenticated surface, no expiry modal. The cookie is never
    // cleared between cases.
    for (const target of ['/login', '/', '/login']) {
      await page.goto(target);
      expect(new URL(page.url()).pathname).toBe('/login');
      await expect(page.getByRole('button', { name: SHELL.logoutName })).toHaveCount(0);
      await expect(page.getByRole('alertdialog', { name: EXPIRY_MODAL })).toHaveCount(0);
    }

    // The only tolerated console noise is the intentional 401 probe above; no
    // app-code/hydration error, no redirect-loop error.
    assertNoAppErrors(appErrors, { allowStatus401: true });
  });
});
