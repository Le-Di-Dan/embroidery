/**
 * E01-J06/J07 — Forced session expiry/revocation and API/network failure
 * classification. The forced-expiry journey (explicitly deferred from A02) uses
 * the safe disposable-database session-mutation seam; the classification journeys
 * use deterministic browser-side interception. Shared services are never
 * permanently stopped.
 *
 * The current-staff query is server-seeded with a 30s freshness window, so a
 * later re-validation is provoked by first letting the data go stale (>30s) and
 * then dispatching real reconnect/focus events — no app-internal test hook.
 */
import { type Page } from '@playwright/test';

import { test, expect } from './support/app1-test';
import { loginAsAdmin } from './support/admin-auth';
import { forceExpireAllAdminSessions, countLiveAdminSessions } from './support/session-store';
import { fetchJsonInPage } from '../support/smoke-test';

const STALE_WAIT_MS = 31_000;
const EXPIRY_MODAL = 'Phiên đăng nhập đã hết hạn';
const RECONNECT_TEXT = /Mất kết nối tạm thời/;
const NETWORK_LOGIN_ALERT = 'Hiện chưa thể đăng nhập. Vui lòng thử lại.';
const LOGOUT_ERROR = 'Hiện chưa thể đăng xuất. Vui lòng thử lại.';

/** Provokes a real client re-validation of a now-stale query (reconnect + focus). */
async function triggerRevalidation(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('admin session lifecycle (E01-J06/J07)', () => {
  test('forced expiry: later 401 shows the modal; it cannot be dismissed', async ({
    page,
    admin,
  }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page, admin);
    expect(await countLiveAdminSessions()).toBe(1);

    // Force the persisted session to expire, then prove the API now answers 401.
    expect(await forceExpireAllAdminSessions()).toBeGreaterThanOrEqual(1);
    expect(await countLiveAdminSessions()).toBe(0);
    const me = await fetchJsonInPage(page, '/api/staff/me');
    expect(me.status, 'later current-staff call is 401').toBe(401);

    // A legitimate client re-validation of the now-stale query surfaces the modal.
    await page.waitForTimeout(STALE_WAIT_MS);
    await triggerRevalidation(page);

    const modal = page.getByRole('alertdialog', { name: EXPIRY_MODAL });
    await expect(modal).toBeVisible({ timeout: 15_000 });
    // Shell stays recognizable beneath the scrim; background is blocked.
    await expect(page.getByRole('banner')).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    // Focus is trapped inside the dialog.
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role="alertdialog"]') !== null),
    ).toBe(true);

    // Neither Escape nor the backdrop dismisses it into the stale shell.
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await page.locator('.admin-shell__scrim--expiry').dispatchEvent('click');
    await expect(modal).toBeVisible();

    // The single action returns to login.
    await page.getByRole('button', { name: 'Đăng nhập lại' }).click();
    await page.waitForURL('**/login');
  });

  test('an initially expired session redirects to /login with no modal', async ({
    page,
    admin,
  }) => {
    test.setTimeout(60_000);
    await loginAsAdmin(page, admin);
    await forceExpireAllAdminSessions();

    // A fresh navigation resolves the session server-side (401) and redirects —
    // the modal is a client-only, already-authenticated concern.
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('alertdialog', { name: EXPIRY_MODAL })).toHaveCount(0);
  });

  test('login network failure shows a safe login error (J07)', async ({ page, admin }) => {
    await page.route('**/api/staff/session', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    await page.goto('/login');
    await page.locator('#staff-login-email').fill(admin.email);
    await page.locator('#staff-login-password').fill(admin.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.getByText(NETWORK_LOGIN_ALERT)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('later current-staff 5xx keeps the shell in a reconnecting state, no modal (J07)', async ({
    page,
    admin,
  }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page, admin);

    // Fail only the later client re-validation of current-staff.
    await page.route('**/api/staff/me', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    );
    await page.waitForTimeout(STALE_WAIT_MS);
    await triggerRevalidation(page);

    await expect(page.getByText(RECONNECT_TEXT)).toBeVisible({ timeout: 15_000 });
    // Shell stays usable; the expiry modal must NOT appear for a dependency failure.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('alertdialog', { name: EXPIRY_MODAL })).toHaveCount(0);
  });

  test('logout network failure keeps the shell with a safe retry (J07)', async ({
    page,
    admin,
  }) => {
    await loginAsAdmin(page, admin);
    await page.route('**/api/staff/session', (route) =>
      route.request().method() === 'DELETE' ? route.abort('failed') : route.continue(),
    );

    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page.getByText(LOGOUT_ERROR)).toBeVisible();
    // Not signed out on a transient failure: still on the shell.
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  });
});
