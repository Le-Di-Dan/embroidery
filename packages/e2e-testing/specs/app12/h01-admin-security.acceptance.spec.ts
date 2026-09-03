/**
 * `APP12-H01` Journey A — the authenticated Admin under the new
 * Content-Security-Policy.
 *
 * ## Why this run exists at all
 *
 * `APP12-H01` published a CSP where there had been none. The first H01 tier
 * proved the header was present on the Admin's `/login` and on the `307` a
 * protected route answers an anonymous caller — which proves the *header* and
 * nothing about the *application*. A policy that blocks a script the operator's
 * screen needs does not fail loudly: the page arrives, the header is correct,
 * and a control quietly does nothing. Only a real browser, past a real login, on
 * the real screens, can tell those two apart.
 *
 * So this file logs in through the delivered staff-session flow and drives the
 * two screens the H01 directive names, asserting three separate things:
 *
 * ```text
 * the document is served with the whole security header set
 * Chromium reports no CSP violation while it renders and hydrates
 * a real interaction on each screen still works
 * ```
 *
 * The third is the one that would catch a broken policy. A screen that renders
 * but cannot filter is a screen whose JavaScript was blocked.
 *
 * ## The credential is this run's own
 *
 * The operator is bootstrapped by the orchestrator with a password generated
 * from `randomBytes` for this run, held in the child process environment, and
 * dropped when the run ends. No shared development credential is read, and the
 * protected `STAFF_BOOTSTRAP_PASSWORD` of a real deployment is never involved.
 */
import { expect, test, type Page } from '@playwright/test';

import { closeS02World, openS02World } from './support/s02-world';
import { COPY, ORDERS_PATH, openOperator } from './support/a02-world';
import { COPY as CATEGORY_COPY } from './support/a01-world';
import {
  expectSecureDocumentHeaders,
  expectSessionCookiePolicy,
  recordCspViolations,
  requiredEnv,
  securityHeadersOf,
} from './support/h01-security';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so the worker control and the evidence reader
   arrive untyped. As in `s03-journeys` and `a02-world`, this file treats those
   imports as `any` and lets each explicit `expect` be the contract. */

/** The delivered Admin category screen (`APP12-A01`). */
const CATEGORIES_PATH = '/categories';

/**
 * The authenticated header evidence this run produces, printed once at the end.
 *
 * Header **names and values**, never a cookie: `securityHeadersOf` drops
 * `set-cookie` by name rather than redacting it.
 */
const authenticatedHeaders: Record<string, Record<string, string>> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await openS02World();
});

test.afterAll(async () => {
  await closeS02World('[app12-h01-admin]');
  process.stdout.write(`[app12-h01-headers] ${JSON.stringify(authenticatedHeaders)}\n`);
});

/**
 * Navigates an already-authenticated operator to a screen and returns the
 * document response, so the caller can read the headers the browser actually
 * received rather than re-requesting them out of band.
 */
async function openAuthenticated(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `a document response for ${path}`).not.toBeNull();
  expect(response!.status(), `${path} is served to the authenticated operator`).toBe(200);
  return response!;
}

test('A1 — the authenticated order queue renders, filters and reports no CSP violation', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const { context, page } = await openOperator(browser);
  const violations = await recordCspViolations(page);

  try {
    await expectSessionCookiePolicy(page);

    const response = await openAuthenticated(page, ORDERS_PATH);
    const headers = securityHeadersOf(response);
    authenticatedHeaders[`GET ${ORDERS_PATH} (200, authenticated)`] = headers;
    expectSecureDocumentHeaders(headers);

    // The screen is really the screen, not a redirect that happened to be 200.
    await expect(page.getByRole('heading', { name: COPY.queueTitle })).toBeVisible({
      timeout: 30_000,
    });

    // ── The interaction that proves hydration ──────────────────────────────
    //
    // The origin filter is a client control: it rewrites the query, refetches
    // through TanStack Query and re-renders the table. If the CSP had blocked
    // the bundle, the heading above would still be there — this is what would
    // not be.
    // The legend text appears twice on this screen (the fieldset legend and the
    // scope note beneath it), so the filter is addressed by its own summary id.
    await expect(page.getByTestId('order-origin-filter-summary')).toBeVisible({
      timeout: 30_000,
    });
    const readyMadeOnly = page.getByTestId('order-origin-filter-READY_MADE');
    await expect(readyMadeOnly).toBeVisible({ timeout: 30_000 });

    // `click()`, not `check()`. The control is **URL-controlled**: its checked
    // state comes back from the query string after the client pushes a new one,
    // so `check()` — which asserts the box flipped synchronously — races the
    // round trip and reports "clicking did not change its state" on a filter
    // that worked. The two assertions below are what actually matter, and they
    // are the ones a blocked bundle would fail.
    await readyMadeOnly.click();

    // The URL is rewritten by the client. A blocked bundle leaves it untouched.
    await expect
      .poll(() => new URL(page.url()).searchParams.getAll('origin').join(','), {
        timeout: 20_000,
      })
      .toBe('READY_MADE');
    // And the control reflects that state once the navigation settles, which is
    // the render half of the same proof.
    await expect(readyMadeOnly).toBeChecked({ timeout: 20_000 });

    // And the reset affordance appeared, which only a filtered state renders —
    // so the client re-rendered rather than merely rewriting the address bar.
    await expect(page.getByTestId('order-filter-reset')).toBeVisible({ timeout: 20_000 });

    expect(await violations(), 'the order queue caused no CSP violation').toEqual([]);
  } finally {
    await context.close();
  }
});

test('A2 — the authenticated category screen renders, opens its editor and reports no CSP violation', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const { context, page } = await openOperator(browser);
  const violations = await recordCspViolations(page);

  try {
    const response = await openAuthenticated(page, CATEGORIES_PATH);
    const headers = securityHeadersOf(response);
    authenticatedHeaders[`GET ${CATEGORIES_PATH} (200, authenticated)`] = headers;
    expectSecureDocumentHeaders(headers);

    await expect(
      page.getByRole('heading', { name: CATEGORY_COPY.pageTitle, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // ── The interaction ────────────────────────────────────────────────────
    //
    // Opening the create panel is a client state transition. It exercises the
    // same bundle the filter above does, on a screen whose whole subject is
    // writing, so a blocked script shows here as a button that does nothing.
    const create = page.getByTestId('category-create');
    await expect(create).toBeVisible({ timeout: 30_000 });
    await create.click();

    const nameField = page.getByTestId('category-name');
    await expect(nameField).toBeVisible({ timeout: 20_000 });
    // The form is live, not merely mounted: a controlled input that refuses to
    // accept a keystroke is the signature of a bundle that failed to hydrate.
    await nameField.fill('H01 kiểm tra CSP');
    await expect(nameField).toHaveValue('H01 kiểm tra CSP');

    expect(await violations(), 'the category screen caused no CSP violation').toEqual([]);
  } finally {
    await context.close();
  }
});

test('A3 — no Admin surface names the framework that served it', async ({ browser, request }) => {
  test.setTimeout(120_000);

  const { context, page } = await openOperator(browser);
  try {
    // Anonymous, authenticated document, and an API denial — three shapes of
    // response, one rule. The API's own policy is stricter than the apps',
    // because a JSON body loads nothing.
    for (const path of [ORDERS_PATH, CATEGORIES_PATH, '/login']) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect('x-powered-by' in (response?.headers() ?? {}), `${path} names no framework`).toBe(
        false,
      );
    }

    // The API denial, from this run's own Admin origin rather than by string
    // surgery on whatever URL the loop above happened to leave behind.
    const denial = await request.get(`${requiredEnv('E2E_BASE_ADMIN')}/api/admin/orders`, {
      failOnStatusCode: false,
    });
    expect(denial.status(), 'an anonymous Admin API call is refused').toBe(401);
    expect('x-powered-by' in denial.headers(), 'the API denial names no framework').toBe(false);
    // And the API's own policy, which is stricter than the apps' because a JSON
    // body loads nothing at all.
    expect(denial.headers()['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  } finally {
    await context.close();
  }
});
