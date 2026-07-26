/**
 * E01-C1-J02 — Initial protected-page server-to-server dependency failure. With
 * a VALID session cookie, the isolated API is stopped and a protected Admin page
 * is requested. The Admin Next server attempts its real `GET /api/staff/me`
 * server-to-server call, which fails at the network layer — NOT a 401 — so the
 * request is NOT redirected to `/login`, no session-expired modal appears, and no
 * raw technical detail is exposed. The dependency failure surfaces as the safe
 * framework 5xx error response (a generic digest-only page — the accepted
 * resolver design throws on `unavailable` rather than treating it as signed-out).
 * The API is then restarted and full recovery is proven.
 *
 * This is a real cross-layer journey: `staffSelfGet` is never mocked and no
 * browser route interception is used. Only the isolated API service is stopped
 * (via the orchestrator control seam); the gateway, Admin, Storefront and
 * PostgreSQL keep running, and the API is always restored in `finally`.
 */
import { type Page } from '@playwright/test';

import { test, expect } from './support/app1-test';
import { loginAsAdmin, logout, SHELL } from './support/admin-auth';
import { hasSessionCookie } from './support/admin-cookie';
import { stopApi, startApi, apiRunning } from './support/api-lifecycle';
import { forceExpireAllAdminSessions } from './support/session-store';
import { fetchJsonInPage } from '../support/smoke-test';

const EXPIRY_MODAL = 'Phiên đăng nhập đã hết hạn';
const LOGIN_HEADING = 'Đăng nhập';

/** Raw internals that must never surface in the user-facing dependency-error UI. */
const FORBIDDEN_DETAIL = [
  'ECONNREFUSED',
  'ECONNRESET',
  'Axios',
  'axios',
  'staffSelfGet',
  'StaffSessionUnavailableError',
  'localhost:',
  'ETIMEDOUT',
  'at Object.',
];

/** Reads the gateway's view of the (now-unavailable) API from inside the page. */
async function upstreamStatusThroughGateway(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/api/health/readiness', { cache: 'no-store' });
      return response.status;
    } catch {
      return 0;
    }
  });
}

test.describe('initial protected-page API unavailability (E01-C1-J02)', () => {
  // Failure-safe: this journey logs in but must never leave a live session that
  // could perturb the serial suite's session-count assertions, even if it fails
  // mid-outage. PostgreSQL is never stopped, so this always runs.
  test.afterEach(async () => {
    await forceExpireAllAdminSessions();
  });

  test('a server-side dependency failure renders the safe boundary, not /login or the expiry modal', async ({
    page,
    context,
    admin,
  }) => {
    test.setTimeout(90_000);

    // Establish a real, valid session and confirm the protected home renders 200.
    await loginAsAdmin(page, admin);
    const initial = await page.goto('/');
    expect(initial?.status(), 'protected home is 200 before the outage').toBe(200);
    expect(await hasSessionCookie(context), 'valid session cookie present by name').toBe(true);

    try {
      // Stop ONLY the isolated API. Gateway/Admin/Storefront/Postgres stay up.
      await stopApi();
      expect(await apiRunning(), 'API is stopped').toBe(false);

      // The gateway now cannot reach its upstream: a direct health probe from the
      // browser fails or returns a 5xx (never a 200 ready).
      const health = await upstreamStatusThroughGateway(page);
      expect(health === 0 || health >= 500, `API unavailable through gateway (got ${health})`).toBe(
        true,
      );

      // Navigate to a protected page. The Admin server attempts staffSelfGet, the
      // dependency fails, and the safe framework 5xx error response renders.
      const response = await page.goto('/');

      // Not classified as unauthenticated: no redirect to /login, and the login
      // screen is NOT shown.
      expect(new URL(page.url()).pathname, 'dependency failure does not redirect to /login').toBe(
        '/',
      );
      await expect(page.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toHaveCount(0);

      // HTTP 5xx: a safe dependency-error response, not a 200 stale shell.
      const status = response?.status() ?? 0;
      expect(status, `document status is 5xx (got ${status})`).toBeGreaterThanOrEqual(500);
      expect(status).toBeLessThan(600);

      // The authenticated shell did NOT render (no stale identity), and there is
      // no session-expired modal for a dependency failure. A safe error surface
      // (a top-level heading) is shown instead.
      await expect(page.getByRole('button', { name: SHELL.logoutName })).toHaveCount(0);
      await expect(page.getByRole('alertdialog', { name: EXPIRY_MODAL })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // No raw technical detail exposed in the UI.
      const bodyText = await page.locator('body').innerText();
      for (const needle of FORBIDDEN_DETAIL) {
        expect(bodyText, `dependency-error UI must not expose "${needle}"`).not.toContain(needle);
      }
    } finally {
      // Always restore the API, even if an assertion failed mid-outage.
      await startApi();
    }

    // Recovery: the API is ready again; the same still-valid session works.
    expect(await apiRunning(), 'API is running after restart').toBe(true);
    const recovered = await upstreamStatusThroughGateway(page);
    expect(recovered, 'API health ready again through the gateway').toBe(200);

    const afterRecovery = await page.goto('/');
    expect(afterRecovery?.status(), 'protected home is 200 after recovery').toBe(200);
    await expect(page.getByText(admin.displayName, { exact: false })).toBeVisible();

    const me = await fetchJsonInPage(page, '/api/staff/me');
    expect(me.status, 'current-staff is 200 after recovery').toBe(200);
    const data = (me.body as { data: Record<string, unknown> }).data;
    expect(data.email).toBe(admin.email);
    expect(data.displayName).toBe(admin.displayName);

    // Revoke this journey's session so no live session leaks into the serial
    // suite's session-count assertions (the disposable DB holds one Admin).
    await logout(page);
  });
});
