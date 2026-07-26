/**
 * E01-J04 — Login identifier rate limiting (locked policy: 5 attempts / 15 min).
 *
 * Uses a fresh, non-existent identifier so the identifier window is exercised in
 * isolation and the real bootstrap Admin is never rate-limited for other tests.
 * The IP/global ceilings are raised for the harness (single shared host IP); the
 * IDENTIFIER boundary asserted here is the real locked value. Attempts 1–5 are
 * generic auth failures; the 6th is a real 429 with a usable Retry-After and the
 * approved rate-limit UI. No credential is written to the URL or a log.
 */
import { test, expect } from './support/app1-test';
import { submitLogin } from './support/admin-auth';

const WRONG_PASSWORD = 'wrong-password-000000';
const RATE_LIMIT_TEXT = /Bạn đã thử đăng nhập quá nhiều lần/;

test.describe('admin login rate limit (E01-J04)', () => {
  test('the 6th attempt on one identifier is 429 with Retry-After and the rate-limit UI', async ({
    page,
  }) => {
    const identifier = `ratelimit-${Date.now()}@e2e.example.test`;

    let postCount = 0;
    page.on('response', (response) => {
      if (response.url().includes('/api/staff/session') && response.request().method() === 'POST') {
        postCount += 1;
      }
    });

    await page.goto('/login');

    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/staff/session') && r.request().method() === 'POST',
        ),
        submitLogin(page, identifier, WRONG_PASSWORD),
      ]);
      statuses.push(response.status());
      if (attempt === 6) retryAfter = response.headers()['retry-after'];
    }

    // Attempts below the threshold are generic failures; the threshold attempt is 429.
    expect(statuses.slice(0, 5), 'attempts 1–5 are generic auth failures').toEqual([
      401, 401, 401, 401, 401,
    ]);
    expect(statuses[5], 'the 6th attempt is rate-limited').toBe(429);

    // Retry-After is present and usable (a non-negative seconds value).
    expect(retryAfter, 'Retry-After header present on 429').toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(0);

    // The approved rate-limit state is shown and the submit control is blocked.
    await expect(page.getByText(RATE_LIMIT_TEXT)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thử lại sau ít phút' })).toBeDisabled();

    // No automatic/duplicate resubmit: exactly the six manual attempts were sent.
    await page.waitForTimeout(500);
    expect(postCount, 'no automatic resubmit beyond the manual attempts').toBe(6);
  });
});
