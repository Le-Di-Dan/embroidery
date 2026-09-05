/**
 * `APP12-V02-C1` §8/§9 — the Admin login screen, measured in a production-mode
 * browser at every width the correction has to hold at.
 *
 * ## Why this is a standalone runner rather than a Playwright project
 *
 * The subject is one route that renders no data. `/login` is a Server Component
 * whose only API call is the already-authenticated redirect probe, and an
 * unreachable API simply renders the login screen — which is the state under
 * test. Bringing up Postgres, MinIO, the API, the worker, the gateway and a
 * seeded commercial universe to look at a two-column layout would add every
 * failure mode in the orchestrator to a measurement that needs none of them,
 * and would put rows in a database this checkpoint is required to leave clean.
 *
 * So this starts the **production build** (`next start`, `NODE_ENV=production`)
 * and nothing else. It is the same binary and the same CSS the e2e tier drives;
 * what it drops is the data plane the login page never touches.
 *
 * ## What it measures
 *
 * At each viewport: the document's own scroll and client widths, the overflow
 * delta between them, and the bounding boxes of the login card, the brand block
 * and the form. Then the keyboard journey, the field semantics, focus-visible,
 * and an axe WCAG 2.2 AA scan. A screenshot per viewport is written beside the
 * JSON so a reader can see what the numbers describe.
 *
 * Nothing is typed into the form and no credential is read: the correction is a
 * layout defect, and a login attempt would need a secret this run has no reason
 * to hold.
 *
 * Usage:
 *   node packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs <outDir> [port]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { GATED_IMPACTS, axeVersion, runAxe } from './h08-axe.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ADMIN_DIR = join(REPO_ROOT, 'apps', 'admin');

/**
 * §8's mandatory widths, plus 390.
 *
 * 390 is measured because the login is the one Admin surface with a real mobile
 * composition — the stacked layout is the stylesheet's *base*, not a fallback —
 * so the runtime does support it and §8 asks for it in that case. The two 200 %
 * zoom widths are WCAG 1.4.10 reproduced the way `APP12-H08` reproduced it: the
 * CSS viewport halved, because Chromium's device scale factor does not change
 * CSS pixel width.
 */
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, required: true },
  { name: '1024', width: 1024, height: 800, required: true },
  { name: '768', width: 768, height: 1024, required: true },
  { name: '390', width: 390, height: 844, required: false },
  { name: '1440@200%', width: 720, height: 450, required: false },
  { name: '1024@200%', width: 512, height: 400, required: false },
];

const SELECTORS = {
  card: '.staff-login__card',
  brand: '.staff-login__brand',
  form: '.staff-login-form',
  email: '#staff-login-email',
  password: '#staff-login-password',
};

function waitForHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) reject(new Error(`timed out waiting for ${url}`));
          else setTimeout(attempt, 500);
        });
    };
    attempt();
  });
}

async function measure(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/login', { waitUntil: 'networkidle' });

  return page.evaluate((selectors) => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        visible: rect.width > 0 && rect.height > 0,
      };
    };
    const root = document.documentElement;
    const reachable = (selector) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= root.clientWidth && rect.width > 0;
    };
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflow: Math.max(0, root.scrollWidth - root.clientWidth),
      card: box(selectors.card),
      brand: box(selectors.brand),
      form: box(selectors.form),
      controls: {
        email: reachable(selectors.email),
        password: reachable(selectors.password),
        submit: reachable('.staff-login-form__submit'),
      },
      passwordType: document.querySelector(selectors.password)?.getAttribute('type') ?? null,
      labelledEmail:
        document.querySelector(`label[for="${selectors.email.slice(1)}"]`) !== null,
      labelledPassword:
        document.querySelector(`label[for="${selectors.password.slice(1)}"]`) !== null,
      headings: Array.from(document.querySelectorAll('h1')).length,
    };
  }, SELECTORS);
}

/** The keyboard journey §9 asks for, without submitting anything. */
async function keyboardJourney(page) {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/login', { waitUntil: 'networkidle' });
  const stops = [];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return null;
      const style = window.getComputedStyle(active);
      return {
        tag: active.tagName.toLowerCase(),
        id: active.id,
        type: active.getAttribute('type'),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
      };
    });
    if (stop !== null) stops.push(stop);
  }
  return stops;
}

/**
 * How the login field actually draws focus.
 *
 * The input sets `outline: none` and the *control wrapper* changes its border
 * colour on `:focus-within` — the pattern `APP12-H08` audited and passed. This
 * records the before/after colour rather than asserting an outline, so the
 * report states what the indicator is instead of implying one that is not there.
 */
async function focusIndicator(page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const read = () =>
    page.evaluate(() => {
      const control = document.querySelector('.staff-login-field__control');
      if (control === null) return null;
      const style = window.getComputedStyle(control);
      return { borderColor: style.borderTopColor, borderWidth: style.borderTopWidth };
    });
  const resting = await read();
  await page.locator(SELECTORS.email).focus();
  const focused = await read();
  return { resting, focused, changes: JSON.stringify(resting) !== JSON.stringify(focused) };
}

/**
 * §10 — the brand, live, after its text authority moved into locale JSON.
 *
 * Read from the message repository rather than typed here: an assertion against
 * a literal in this file would be a third authority agreeing with the first two,
 * which is the shape the correction exists to remove.
 */
async function brandRendering(page) {
  const name = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/i18n/messages/vi/common.json'), 'utf8'),
  ).brand.name;

  await page.goto('/login', { waitUntil: 'networkidle' });
  return page.evaluate((brandName) => {
    const texts = Array.from(document.querySelectorAll('body *')).filter(
      (element) =>
        element.children.length === 0 && (element.textContent ?? '').trim() === brandName,
    );
    const symbol = document.querySelector('svg');
    return {
      brandName,
      visibleOccurrences: texts.length,
      renderedIn: texts.map((element) => element.className || element.tagName.toLowerCase()),
      // The mark beside the name must stay unnamed, or a screen reader says the
      // brand twice — the rule the brand panel's own comment states.
      symbolPresent: symbol !== null,
      symbolAccessibleName:
        symbol === null
          ? null
          : (symbol.getAttribute('aria-label') ?? symbol.querySelector('title')?.textContent ?? null),
      symbolAriaHidden: symbol?.getAttribute('aria-hidden') ?? null,
    };
  }, name);
}

async function main() {
  const outDir = process.argv[2];
  const port = Number(process.argv[3] ?? 3311);
  if (outDir === undefined) throw new Error('usage: <outDir> [port]');
  mkdirSync(outDir, { recursive: true });

  const nextBin = require.resolve('next/dist/bin/next', { paths: [ADMIN_DIR] });
  const server = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: ADMIN_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Deliberately unreachable: the login route's only API call is the
        // already-authenticated probe, which falls through to rendering the
        // form. Nothing else on this screen reads the API.
        INTERNAL_API_BASE_URL: `http://127.0.0.1:${String(port + 900)}/api`,
      },
      stdio: 'ignore',
    },
  );

  const baseURL = `http://127.0.0.1:${String(port)}`;
  const record = { baseURL, mode: 'production (next start)', axe: axeVersion(), viewports: [] };

  try {
    await waitForHttp(`${baseURL}/login`);
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    for (const viewport of VIEWPORTS) {
      const geometry = await measure(page, viewport);
      const scan = await runAxe(page, { label: `admin-login@${viewport.name}` });
      const gated = scan.violations.filter((violation) =>
        GATED_IMPACTS.includes(violation.impact),
      );
      await page.screenshot({
        path: join(outDir, `admin-login-${viewport.name.replace(/[@%]/gu, '-')}.png`),
        fullPage: true,
      });
      record.viewports.push({ ...viewport, ...geometry, axeViolations: scan.violations, gated });
      const status = geometry.overflow === 0 ? 'OK ' : 'FAIL';
      console.log(
        `${status} ${viewport.name.padEnd(10)} scrollWidth ${String(geometry.scrollWidth).padStart(5)}  ` +
          `clientWidth ${String(geometry.clientWidth).padStart(5)}  overflow ${String(geometry.overflow).padStart(4)}px  ` +
          `brand ${String(geometry.brand?.width ?? 0).padStart(4)}  card ${String(geometry.card?.width ?? 0).padStart(4)}  ` +
          `axe serious/critical ${String(gated.length)}`,
      );
    }

    record.keyboard = await keyboardJourney(page);
    record.focusIndicator = await focusIndicator(page);
    record.brand = await brandRendering(page);
    await browser.close();
  } finally {
    server.kill();
  }

  writeFileSync(join(outDir, 'login-reflow.json'), `${JSON.stringify(record, null, 2)}\n`);

  const failures = record.viewports.filter((v) => v.overflow > 0);
  const axeFailures = record.viewports.filter((v) => v.gated.length > 0);
  console.log(
    `\noverflow > 0: ${String(failures.length)} · axe serious/critical: ${String(axeFailures.length)} viewport(s)`,
  );
  return failures.length === 0 && axeFailures.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
