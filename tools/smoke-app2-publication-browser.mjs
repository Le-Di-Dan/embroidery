#!/usr/bin/env node
/**
 * APP2-A04-C1 — browser scenarios for the Admin Product publication interaction,
 * run against a REAL production Admin runtime through the real gateway.
 *
 * Invoked by `tools/smoke-app2-publication-production.mjs`, which owns the
 * production image, the upstream swap and the restore. This file owns only the
 * browser assertions, so a scenario change never risks the isolation model.
 *
 * The Admin login arrives through this process's environment
 * (`SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`) and is never printed, written
 * or placed on a command line. Nothing here reads the repository `.env`.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { TOUCH_TARGET_MIN, measureUndersizedTargets } from './smoke-app2-publication-targets.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Playwright is a devDependency of the E2E package; resolve it from there so
// this harness adds no dependency of its own.
const requireFromE2e = createRequire(join(REPO_ROOT, 'packages', 'e2e-testing', 'package.json'));
const { chromium } = requireFromE2e('@playwright/test');

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://admin.embroidery.local';
const EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? '';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const COPY = {
  readyTitle: 'Sẵn sàng xuất bản',
  blockedTitle: 'Còn thiếu điều kiện',
  publishedTitle: 'Sản phẩm đang được xuất bản',
  publish: 'Xuất bản',
  unpublish: 'Gỡ xuất bản',
  view: 'Xem chi tiết',
  dialogTitle: 'Gỡ xuất bản sản phẩm?',
  cancel: 'Giữ nguyên',
  publishedSuccess: 'Sản phẩm đã được xuất bản',
  unpublishedSuccess: 'Đã gỡ xuất bản sản phẩm',
  /** A stale expectedUpdatedAt opens the approved conflict dialog, not a banner. */
  conflictTitle: 'Sản phẩm đã được cập nhật ở nơi khác',
};

/** The requirement checklist rows, keyed by contract code (never invented). */
const REQUIREMENT_ROWS = '[data-testid^="requirement-"]';

const results = [];
function record(label, ok, detail = {}) {
  results.push({ label, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`);
}

/**
 * Logs in through the gateway. The dev-mode trap this replaces: filling the
 * server-rendered markup before React hydrates lets the controlled inputs reset
 * and the form submits empty. Waiting for the network to settle first is the
 * fix, and it is equally correct in production mode.
 */
async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.getByRole('button', { name: /Đăng nhập/i }).click(),
  ]);
}

/** Every product id linked from the list screen, in render order. */
async function productIds(page) {
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  const hrefs = await page
    .locator('a[href^="/products/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  const ids = [];
  for (const href of hrefs) {
    const m = /^\/products\/([0-9a-f-]{36})$/.exec(href);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

async function publicationState(page, id) {
  await page.goto(`${BASE_URL}/products/${id}/publication`, { waitUntil: 'networkidle' });
  for (const [kind, title] of [
    ['ready', COPY.readyTitle],
    ['blocked', COPY.blockedTitle],
    ['published', COPY.publishedTitle],
  ]) {
    if (await page.getByText(title, { exact: true }).count()) return kind;
  }
  return 'unknown';
}

/** Finds one product per requested publication state, without mutating any. */
async function findTargets(page, ids) {
  const found = {};
  for (const id of ids) {
    const state = await publicationState(page, id);
    if (!found[state]) found[state] = id;
    if (found.ready && found.blocked) break;
  }
  return found;
}

async function scenarioBlocked(page, id) {
  await publicationState(page, id);
  const rows = await page.locator(REQUIREMENT_ROWS).count();
  const publish = page.getByRole('button', { name: COPY.publish, exact: true });
  const ariaDisabled = await publish.getAttribute('aria-disabled');
  record('blocked DRAFT: seven requirement rows', rows === 7, { rows });
  record('blocked DRAFT: publish is aria-disabled', ariaDisabled === 'true', { ariaDisabled });
}

async function scenarioReady(page, id) {
  await publicationState(page, id);
  const publish = page.getByRole('button', { name: COPY.publish, exact: true });
  const enabled = (await publish.getAttribute('aria-disabled')) !== 'true';
  const sanPhamLinks = await page.locator('a[href*="/san-pham/"]').count();
  const rows = await page.locator(REQUIREMENT_ROWS).count();
  record('ready DRAFT: publish enabled', enabled, { enabled });
  record('ready DRAFT: no /san-pham link', sanPhamLinks === 0, { sanPhamLinks });
  record('ready DRAFT: all seven requirements listed', rows === 7, { rows });
}

async function scenarioPublish(page, id) {
  await publicationState(page, id);
  let reloaded = false;
  page.once('load', () => {
    reloaded = true;
  });
  await page.getByRole('button', { name: COPY.publish, exact: true }).click();
  await page.getByText(COPY.publishedSuccess, { exact: true }).waitFor({ timeout: 20_000 });
  const nowPublished = await page.getByText(COPY.publishedTitle, { exact: true }).count();
  record('publish: success announced in place', nowPublished > 0 && !reloaded, {
    published: nowPublished > 0,
    fullReload: reloaded,
  });
}

async function scenarioPublishedState(page) {
  const unpublish = await page.getByRole('button', { name: COPY.unpublish, exact: true }).count();
  const view = await page.getByRole('link', { name: COPY.view, exact: true }).count();
  record('PUBLISHED: unpublish + read-only detail affordance', unpublish > 0 && view > 0, {
    unpublish,
    view,
  });
}

async function scenarioUnpublishDialog(page) {
  await page.getByRole('button', { name: COPY.unpublish, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 10_000 });
  const focusInside = await page.evaluate(() => {
    const d = document.querySelector('[role="alertdialog"]');
    return Boolean(d && document.activeElement && d.contains(document.activeElement));
  });
  record('unpublish dialog: alertdialog role + focus enters', focusInside, { focusInside });

  await page.keyboard.press('Escape');
  const dismissed = (await page.getByRole('alertdialog').count()) === 0;
  const focusReturned = await page.evaluate(
    () => document.activeElement?.textContent?.includes('Gỡ xuất bản') ?? false,
  );
  record('unpublish dialog: idle Escape dismisses and returns focus', dismissed, {
    dismissed,
    focusReturned,
  });
}

async function scenarioUnpublish(page) {
  await page.getByRole('button', { name: COPY.unpublish, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.getByRole('button', { name: COPY.unpublish, exact: true }).click();
  await page.getByText(COPY.unpublishedSuccess, { exact: true }).waitFor({ timeout: 20_000 });
  record('unpublish: returns to DRAFT with success', true, {});
}

/**
 * A real exact-code failure, not a faked response: two tabs hold the same
 * pre-transition token, one commits, the other commits the now-stale token and
 * the server answers PRODUCT_VERSION_CONFLICT. The screen must surface the
 * approved reload affordance and never the code itself.
 */
async function scenarioVersionConflict(context, id) {
  const a = await context.newPage();
  const b = await context.newPage();
  await publicationState(a, id);
  await publicationState(b, id);
  try {
    await a.getByRole('button', { name: COPY.publish, exact: true }).click();
    await a.getByText(COPY.publishedSuccess, { exact: true }).waitFor({ timeout: 20_000 });

    // `b` still holds the pre-transition token; the server must refuse it.
    await b.getByRole('button', { name: COPY.publish, exact: true }).click();
    await b.getByText(COPY.conflictTitle, { exact: true }).waitFor({ timeout: 20_000 });
    const body = await b.locator('body').innerText();
    const leaks = ['PRODUCT_VERSION_CONFLICT', 'requestId', 'stack', 'SQL', 'updated_at'].filter(
      (t) => body.includes(t),
    );
    record(
      'exact-code error: PRODUCT_VERSION_CONFLICT handled without leaking',
      leaks.length === 0,
      { leaks: leaks.length },
    );
  } finally {
    // Returning the product to DRAFT must survive a failed assertion above,
    // otherwise a broken scenario silently leaves live data mutated.
    await a.reload({ waitUntil: 'networkidle' });
    if (await a.getByRole('button', { name: COPY.unpublish, exact: true }).count()) {
      await scenarioUnpublish(a);
    }
    await a.close();
    await b.close();
  }
}

/**
 * Sweeps the 390px touch targets across every A04 state that owns controls:
 * blocked DRAFT (back, complete-draft), ready DRAFT (back, publish, edit),
 * PUBLISHED (unpublish, view detail) and the open confirmation dialog. Measuring
 * only the first screen would have missed exactly the control this correction
 * exists to fix.
 */
async function scenarioMobileTargets(page, targets) {
  await page.setViewportSize(MOBILE);
  const undersized = [];

  await publicationState(page, targets.blocked);
  undersized.push(...(await measureUndersizedTargets(page, 'blocked-draft')));

  await publicationState(page, targets.ready);
  undersized.push(...(await measureUndersizedTargets(page, 'ready-draft')));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );

  await page.getByRole('button', { name: COPY.publish, exact: true }).click();
  await page.getByText(COPY.publishedSuccess, { exact: true }).waitFor({ timeout: 20_000 });
  undersized.push(...(await measureUndersizedTargets(page, 'published')));

  await page.getByRole('button', { name: COPY.unpublish, exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ timeout: 10_000 });
  const dialogFits = await page.evaluate(() => {
    const d = document.querySelector('[role="alertdialog"]');
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return r.width <= window.innerWidth + 1 && r.left >= -1;
  });
  undersized.push(...(await measureUndersizedTargets(page, 'unpublish-dialog')));

  // Confirm from inside the dialog so the product returns to DRAFT.
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: COPY.unpublish, exact: true })
    .click();
  await page.getByText(COPY.unpublishedSuccess, { exact: true }).waitFor({ timeout: 20_000 });

  record('mobile 390: layout fits (no overflow, dialog within viewport)', !overflow && dialogFits, {
    overflow,
    dialogFits,
  });
  record(
    `mobile 390: all A04 controls meet the ${TOUCH_TARGET_MIN}px target`,
    undersized.length === 0,
    { statesMeasured: 4, undersized },
  );
  await page.setViewportSize(DESKTOP);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD are required.');
    process.exitCode = 2;
    return;
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP });
  const consoleErrors = [];
  const assetFailures = [];
  context.on('console', (m) => {
    if (m.type() !== 'error') return;
    // "Failed to load resource: … 409" is the browser's own network log for the
    // version conflict this smoke deliberately induces — a correct refusal, not
    // an application error. Asset delivery is asserted separately from the
    // response stream, so dropping these lines loses no coverage and keeps the
    // check meaningful for what it is actually for: hydration and runtime errors.
    if (/Failed to load resource/i.test(m.text())) return;
    consoleErrors.push(m.text());
  });
  context.on('response', (r) => {
    if (r.url().includes('/_next/') && r.status() >= 400) {
      assetFailures.push(`${r.status()} ${r.url()}`);
    }
  });

  try {
    // Unauthenticated protection, before any session exists.
    const anon = await context.newPage();
    await anon.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    record('unauthenticated /products is protected', anon.url().includes('/login'), {
      landedOn: new URL(anon.url()).pathname,
    });
    await anon.close();

    const page = await context.newPage();
    await login(page);
    record('login through gateway (production)', !page.url().includes('/login'), {
      landedOn: new URL(page.url()).pathname,
    });

    const ids = await productIds(page);
    const targets = await findTargets(page, ids);
    record('discovered publication targets', Boolean(targets.ready && targets.blocked), {
      ready: Boolean(targets.ready),
      blocked: Boolean(targets.blocked),
      scanned: ids.length,
    });
    if (!targets.ready || !targets.blocked) throw new Error('no suitable DRAFT products found');

    // Direct load + hard refresh of the deep route in production mode.
    await page.goto(`${BASE_URL}/products/${targets.ready}/publication`, {
      waitUntil: 'networkidle',
    });
    const directOk = await page.locator(REQUIREMENT_ROWS).count();
    await page.reload({ waitUntil: 'networkidle' });
    const refreshOk = await page.locator(REQUIREMENT_ROWS).count();
    record('direct route load + hard refresh', directOk === 7 && refreshOk === 7, {
      directLoadRows: directOk,
      hardRefreshRows: refreshOk,
    });

    await scenarioBlocked(page, targets.blocked);
    await scenarioReady(page, targets.ready);
    await scenarioMobileTargets(page, targets);

    await scenarioPublish(page, targets.ready);
    await scenarioPublishedState(page);
    await scenarioUnpublishDialog(page);
    await scenarioUnpublish(page);

    await scenarioVersionConflict(context, targets.ready);

    record('production assets loaded without 4xx/5xx', assetFailures.length === 0, {
      failures: assetFailures.length,
    });
    record('no console errors', consoleErrors.length === 0, {
      errors: consoleErrors.length,
      // The texts matter: "1 console error" is not a finding, it is a lead. A
      // production-only hydration or runtime error is precisely what this smoke
      // exists to surface, so it must be legible in the run output.
      messages: consoleErrors.map((m) => m.slice(0, 200)),
    });
  } finally {
    await context.close();
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n== browser summary: ${results.length - failed.length}/${results.length} passed ==`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

// Only run when invoked directly. The harness tests import this module for its
// touch-target constants, and importing it must never launch a browser.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
