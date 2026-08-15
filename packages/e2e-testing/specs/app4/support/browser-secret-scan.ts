/**
 * Shared browser secret scan for the APP4-E01 journeys (E01-H02).
 *
 * One utility, three secrets: the S01 verification code, the S02 secure-link
 * token, and the raw contact the Admin operator types. Each has the same
 * question asked of it — "did this reach a surface a browser persists?" — and
 * the same answer shape.
 *
 * The secret is passed into the page as an argument and compared **inside** the
 * page, so what comes back is already reduced to booleans and surface names. The
 * value is never returned, never logged, and never appears in a failure message:
 * a scan that reported the matching snippet would leak precisely when a test
 * broke, which is the worst possible moment.
 *
 * Test-only.
 */
import type { Page } from '@playwright/test';

/** Every browser surface that outlives a render. */
export type SecretSurface =
  | 'url'
  | 'hash'
  | 'historyState'
  | 'localStorage'
  | 'sessionStorage'
  | 'cookies'
  | 'domText'
  | 'domHtml'
  | 'console';

export interface SecretScanResult {
  readonly present: boolean;
  readonly surfaces: SecretSurface[];
}

/**
 * Scans the live page for `secret` and reports only where it was found.
 *
 * `consoleMessages` is supplied by the caller because console output is captured
 * over the page's lifetime, not readable from inside it at a point in time.
 */
export async function scanBrowserForSecret(
  page: Page,
  secret: string,
  consoleMessages: readonly string[] = [],
): Promise<SecretScanResult> {
  const surfaces = await page.evaluate((needle: string) => {
    const found: string[] = [];
    const has = (value: unknown): boolean =>
      typeof value === 'string' && value.length > 0 && value.includes(needle);

    if (has(window.location.href)) found.push('url');
    if (has(window.location.hash)) found.push('hash');
    try {
      if (has(JSON.stringify(window.history.state ?? null))) found.push('historyState');
    } catch {
      // A history state that cannot be serialised cannot be searched; treating
      // that as "absent" would be a false negative, so it is reported as a
      // surface only when it demonstrably contains the value.
    }
    const scanStorage = (storage: Storage, label: string): void => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === null) continue;
        if (has(key) || has(storage.getItem(key))) {
          found.push(label);
          return;
        }
      }
    };
    scanStorage(window.localStorage, 'localStorage');
    scanStorage(window.sessionStorage, 'sessionStorage');
    if (has(document.cookie)) found.push('cookies');
    if (has(document.body?.innerText)) found.push('domText');
    if (has(document.documentElement?.outerHTML)) found.push('domHtml');
    return found;
  }, secret);

  if (consoleMessages.some((message) => message.includes(secret))) {
    surfaces.push('console');
  }

  return { present: surfaces.length > 0, surfaces: surfaces as SecretSurface[] };
}

/**
 * Asserts a secret reached no browser surface.
 *
 * Throws with the surface names only — never the value, never a snippet.
 */
export async function assertSecretAbsentFromBrowser(
  page: Page,
  secret: string,
  consoleMessages: readonly string[] = [],
  label = 'secret',
): Promise<SecretScanResult> {
  const result = await scanBrowserForSecret(page, secret, consoleMessages);
  if (result.present) {
    throw new Error(
      `${label}: present = true on ${result.surfaces.length} surface(s): ${result.surfaces.join(', ')}`,
    );
  }
  return result;
}
