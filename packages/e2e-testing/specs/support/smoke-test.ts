/**
 * Shared smoke-test base: captures page errors and severe console errors and
 * fails the test if any owned-app error slipped through. Lives under `specs/`
 * (not the Node orchestration `support/`) so the portable container copy of the
 * specs carries it. Imports nothing from the workspace — Playwright only.
 */
import { test as base, expect, type Page } from '@playwright/test';

/** Benign, non-owned noise tolerated even in production mode. */
const IGNORED = [/favicon\.ico/i, /Failed to load resource.*favicon/i];

type SmokeFixtures = {
  /** Collected page/console errors; asserted empty after the test body. */
  pageErrors: string[];
};

export const test = base.extend<SmokeFixtures>({
  pageErrors: async ({ page }: { page: Page }, use: (errors: string[]) => Promise<void>) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`console.error: ${message.text()}`);
      }
    });

    await use(errors);

    const severe = errors.filter((entry) => !IGNORED.some((pattern) => pattern.test(entry)));
    expect(severe, `unexpected severe page/console errors:\n${severe.join('\n')}`).toEqual([]);
  },
});

export { expect };

/** Reads a same-origin JSON endpoint from inside the page (uses the browser's
 * gateway-hostname resolution, proving the response came through the gateway). */
export async function fetchJsonInPage(
  page: Page,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async (target: string) => {
    const response = await fetch(target, { headers: { accept: 'application/json' } });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    return { status: response.status, body: parsed };
  }, path);
}
