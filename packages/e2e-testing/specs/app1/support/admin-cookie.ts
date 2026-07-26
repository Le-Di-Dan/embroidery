/**
 * Forged-session-cookie seam for the invalid/stale cookie route matrix
 * (E01-C1-J01). It installs a syntactically valid but semantically invalid
 * `adm_session` cookie into a fresh browser context so the fast cookie-presence
 * proxy lets the request through to authoritative server validation, which the
 * real API then rejects (401).
 *
 * The cookie is host-only (a bare `domain` with no leading dot), Path=/, and
 * HttpOnly — mirroring the real dev cookie — so client code can never read its
 * value. The forged value is random and is NEVER logged, asserted against, or
 * returned; only its presence (by name) is ever observed.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const SESSION_COOKIE_NAME = 'adm_session';

/**
 * Installs a forged, invalid `adm_session` cookie on the given admin origin.
 * Returns nothing — the value is intentionally not exposed to the caller.
 */
export async function setForgedSessionCookie(
  context: BrowserContext,
  adminBaseUrl: string,
): Promise<void> {
  // A clearly-invalid opaque token: non-empty, random, and not a real session.
  const forged = `forged-invalid-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const { hostname } = new URL(adminBaseUrl);
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: forged,
      domain: hostname, // host-only (no leading dot)
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    },
  ]);
}

/** True when a cookie of the session name is present in the context (name only). */
export async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some((c) => c.name === SESSION_COOKIE_NAME);
}

/**
 * Asserts the session cookie is present but unreadable by client JavaScript
 * (HttpOnly): its name/value must not appear in `document.cookie`. Proves the
 * forged value never crosses into client code.
 */
export async function assertSessionCookieHttpOnly(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  expect(await hasSessionCookie(context), 'forged session cookie present in context').toBe(true);
  const visible = await page.evaluate(() => document.cookie);
  expect(visible, 'session cookie must be HttpOnly (absent from document.cookie)').not.toContain(
    SESSION_COOKIE_NAME,
  );
}
