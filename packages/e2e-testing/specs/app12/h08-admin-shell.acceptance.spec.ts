/**
 * `APP12-H08` §4 and §8 — the shared Admin shell, at the widths it is drawn at.
 *
 * Split from `h08-admin-journey` because it is a different subject and needs a
 * different world. The journey spends a whole commercial universe on one order
 * so it can drive the fee, the verification and the fulfilment rail; this file
 * needs an authenticated operator and nothing else, and every screen it audits
 * is a read.
 *
 * ```text
 * A  the compact app bar and its drawer   §4  (the PO restructure)
 * B  reflow at 1440 / 1024 / 200% zoom    §8
 * ```
 *
 * ## The login here is clicked, and the journey's is not
 *
 * `openOperator` fills the form and presses the button. That is setup: the
 * *keyboard* login is the subject of `h08-admin-journey` case A, and proving it
 * twice would only make this file slower. Everything below that is actually
 * under test — the trigger, the drawer, the focus return — is keyboard-driven.
 *
 * ## Secrecy
 *
 * The operator password is read from the child environment and typed into the
 * real form; it is never returned, asserted on, recorded or printed. Trace,
 * video, screenshot and HAR are off for this project.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { ORDERS_PATH, openOperator } from './support/a02-world';
import {
  ADMIN_VIEWPORTS,
  ZOOM_200,
  expectNoSeriousViolations,
  expectShellLandmarks,
  record,
  reportProofs,
} from './support/h08-world';
import {
  activeElement,
  expectFocusIsDrawn,
  expectNoHorizontalOverflow,
  tabThrough,
  tabUntil,
} from './support/h08-metrics';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/** Below `$shell-breakpoint` (1024px), which is where the compact bar applies. */
const COMPACT = { width: 900, height: 800 } as const;

test.describe.configure({ mode: 'serial', timeout: 300_000 });

let context: BrowserContext;
let operator: Page;

test.beforeAll(async ({ browser }) => {
  // No `warmGateway` here, deliberately: this file runs after the Admin journey
  // in the same project, so the gateway connection to both origins is already
  // open. A warm-up *after* `openOperator` — which navigates and logs in — would
  // sit downstream of the very call it is supposed to protect, which is worse
  // than none: it would look like a guard and be decoration.
  const session = await openOperator(browser);
  context = session.context;
  operator = session.page;
});

test.afterAll(async () => {
  await context.close();
  reportProofs('[app12-h08-admin-shell]');
});

test('A — the compact app bar and its drawer stay usable', async () => {
  // The PO restructure: below the shell breakpoint the bar carries the brand and
  // the trigger, and the operator block moves into the drawer. §4 asks four
  // things of it, and each is asserted rather than looked at.
  await operator.setViewportSize(COMPACT);
  await operator.goto(ORDERS_PATH);
  await expect(operator.getByRole('heading', { level: 1 })).toBeVisible();

  // 1. The brand is still announced, even though the words are visually hidden.
  const brand = await operator.evaluate(() => {
    const text = document.querySelector('.admin-shell__brand-text');
    if (text === null) return null;
    const style = window.getComputedStyle(text);
    const rect = text.getBoundingClientRect();
    return {
      inTree: text.getAttribute('aria-hidden') !== 'true' && style.display !== 'none',
      visuallyHidden: rect.width <= 2 || rect.height <= 2,
      content: (text.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  record('admin.compact_brand', brand?.content ?? '(none)');
  expect(brand?.inTree, 'the compact brand stays in the accessibility tree').toBe(true);
  expect(brand?.visuallyHidden, 'and is hidden visually rather than removed').toBe(true);
  expect(brand?.content, 'and still carries the brand name').toContain('Nét Thêu');

  // 2. The hidden desktop controls are not stray tab stops. `-1` would mean the
  //    trail is still displayed, which is a different failure and worth telling
  //    apart from "displayed and focusable".
  const strays = await operator.evaluate(() => {
    const trail = document.querySelector('.admin-shell__bar-trail');
    if (trail === null) return 0;
    if (window.getComputedStyle(trail).display !== 'none') return -1;
    return Array.from(trail.querySelectorAll('a, button, input')).filter(
      (element) => (element as HTMLElement).offsetParent !== null,
    ).length;
  });
  record('admin.compact_bar_strays', strays);
  expect(strays, 'the hidden desktop trail leaves no focusable behind').toBe(0);

  // 3. The trigger is keyboard-reachable, opens the drawer, and focus enters.
  const trigger = await tabUntil(
    operator,
    'the Admin nav trigger',
    (active) => active.tag === 'button' && active.name.includes('menu'),
    30,
  );
  record('admin.drawer_trigger', trigger.name);
  await expectFocusIsDrawn(operator, 'admin-drawer-trigger');
  await operator.keyboard.press('Enter');

  const drawer = operator.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expectNoSeriousViolations(operator, 'admin-drawer-open');

  const inside = await operator.evaluate(() => {
    const element = document.querySelector('[role="dialog"]');
    return element !== null && element.contains(document.activeElement);
  });
  expect(inside, 'focus enters the Admin drawer').toBe(true);

  // 4. Identity and logout are reachable inside it, and the landmark contract
  //    still holds with the drawer open — the sidebar is hidden at this width,
  //    so a second navigation landmark sharing its name would be the duplicate
  //    §4 forbids.
  await expect(drawer.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expectShellLandmarks(operator, 'admin-drawer-open');

  const walk = await tabThrough(operator, 10);
  const escaped = await operator.evaluate(() => {
    const element = document.querySelector('[role="dialog"]');
    return element === null || !element.contains(document.activeElement);
  });
  record('admin.drawer_tab_stops', new Set(walk.map((stop) => stop.name)).size);
  expect(escaped, 'Tab never leaves the open Admin drawer').toBe(false);

  await operator.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  const restored = await activeElement(operator);
  expect(restored.name, 'focus returns to the Admin nav trigger').toContain('menu');
});

test('B — the operator screens survive both widths and 200% zoom', async () => {
  for (const viewport of [...ADMIN_VIEWPORTS, ...ZOOM_200]) {
    await operator.setViewportSize({ width: viewport.width, height: viewport.height });
    await operator.goto(ORDERS_PATH);
    await expect(operator.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(operator, `admin-queue@${viewport.name}`);

    // Reflow is about content surviving, not only about a scrollbar being
    // absent. The operator's own way out of the session must still be reachable
    // at every width — on the bar above the breakpoint, behind the trigger below
    // it — so a layout that "fits" by dropping the logout control fails here.
    const logoutReachable = await operator.evaluate(() => {
      const inBar = Array.from(document.querySelectorAll('button')).some(
        (button) =>
          (button.textContent ?? '').includes('Đăng xuất') && button.offsetParent !== null,
      );
      const trigger = document.querySelector('.admin-shell__nav-trigger');
      const triggerShown = trigger !== null && window.getComputedStyle(trigger).display !== 'none';
      return inBar || triggerShown;
    });
    record(`admin.logout_reachable@${viewport.name}`, logoutReachable === true);
    expect(
      logoutReachable,
      `admin-queue@${viewport.name}: the operator can still leave the session`,
    ).toBe(true);
  }

  await operator.setViewportSize({ width: 1440, height: 900 });
});
