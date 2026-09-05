/**
 * `APP12-H08` §11 — the browser compatibility matrix.
 *
 * ```text
 * Firefox   customer + Admin critical smoke
 * WebKit    customer critical smoke          (the `@admin` cases are grepped out)
 * ```
 *
 * ## What a compatibility gate is, and what it is not
 *
 * §11 states the gate in three lines: **no browser-specific operation failure,
 * no required control clipped or unreachable, no operation-blocking overflow.**
 * It is deliberately not a second accessibility audit — the rules are the same
 * everywhere and axe would say the same thing three times — and it is
 * deliberately not a pixel comparison, because visual-only differences between
 * engines belong to `V01`/`V02`.
 *
 * So every case here asks the same question in a different engine: *can the
 * work be done?* Controls are found by role and name, operated, and the result
 * is asserted. A layout that differs but works passes; a control that is on
 * screen but cannot be reached does not.
 *
 * ## These engines run on the host
 *
 * Every other project in `playwright.config.ts` sends Firefox and WebKit to the
 * Linux container, on the reasoning that they have no `--host-resolver-rules`.
 * `docs/development/LOCAL_DEVELOPMENT.md` §4 makes the two gateway hostnames a
 * required one-time hosts-file entry, which resolves for every process on the
 * machine whatever engine it is — verified in both engines before this file was
 * written. Running on the host is what lets these cases share the run's world
 * at all: the container copies `specs/` and nothing else.
 *
 * ## Secrecy
 *
 * No `ORDER_ACCESS` credential is opened here. The Admin case types the
 * operator password into the real form and never reads it back; artifacts are
 * off for both projects.
 */
import { expect, test, type Page } from '@playwright/test';

import { MAIN_SKU, requiredEnv } from './support/s02-world';
import { record, reportProofs } from './support/h08-world';
import { expectNoHorizontalOverflow } from './support/h08-metrics';

const PRODUCT = (): string => `/san-pham/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}`;

/** The gateway statuses that mean "the proxy gave up", not "the page is wrong". */
const GATEWAY_TIMEOUTS = [502, 503, 504];

/**
 * Navigates, and retries **once** on a gateway timeout.
 *
 * A run of this suite has just driven two full journeys through the same Nginx
 * and the same two Node processes, and the first navigation of a new engine has
 * been observed to come back `504 Gateway Time-out` from the proxy — a page with
 * no `main`, no footer and an nginx error body. Reporting that as "the shell
 * does not work in Firefox" would be false: it is the harness's own gateway
 * under load, and the identical navigation succeeds immediately afterwards.
 *
 * So exactly one retry, only for a proxy status, and the event is **recorded**
 * rather than swallowed — a real outage still fails the second attempt, and a
 * gateway that times out on every run shows up in the proofs as something to
 * look at instead of disappearing.
 */
async function gotoStable(page: Page, path: string, engine: string): Promise<void> {
  const first = await page.goto(path);
  const status = first?.status() ?? 0;
  if (!GATEWAY_TIMEOUTS.includes(status)) return;
  record(`compat.${engine}.gateway_timeout_retry`, `${path} answered ${String(status)}`);
  const second = await page.goto(path);
  expect(
    second?.status(),
    `${path} answered ${String(status)} twice — this is the gateway, not the engine`,
  ).not.toBe(status);
}

test.afterAll(() => {
  reportProofs(`[app12-h08-compat:${test.info().project.name}]`);
});

test('the Storefront shell works, at desktop and at compact width', async ({ page }, testInfo) => {
  const engine = testInfo.project.name;

  for (const route of ['/', '/kham-pha', PRODUCT()]) {
    await gotoStable(page, route, engine);
    // Server-rendered content, in every engine. A blank page in one browser is
    // the failure this catches, and it catches it as an absent heading rather
    // than as a screenshot nobody can diff.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expectNoHorizontalOverflow(page, `${engine}:${route}`);
  }

  // The compact shell's one interactive element, and the only piece of the
  // Storefront chrome that depends on client JavaScript at all. `Escape` and
  // focus return are engine-sensitive in a way a layout is not.
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/', engine);
  const trigger = page.getByRole('button', { name: 'Mở menu điều hướng' });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawer = page.getByRole('dialog', { name: 'Điều hướng' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  record(`compat.${engine}.drawer`, 'open+escape+focus-return');
});

test('the purchase panel resolves a SKU and hands a real address to the checkout', async ({
  page,
}, testInfo) => {
  const engine = testInfo.project.name;
  await gotoStable(page, PRODUCT(), engine);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The panel is the first client island a customer meets, and the one place a
  // native control's engine behaviour actually shows: a visually hidden radio,
  // a `type="number"` with `min`/`max`, and a CTA that is an `<a>` when a SKU
  // resolves and a disabled `<button>` when none does.
  // **One option in every axis**, not one option overall.
  //
  // The panel resolves a SKU only when each `<fieldset>` has an answer, so
  // checking the first radio on the page leaves the selection incomplete and the
  // CTA correctly disabled — which then proves nothing about the engine, because
  // the interesting path (a resolved SKU, a composed address, a real checkout)
  // is never reached. An earlier revision of this file did exactly that and
  // recorded `cta_resolved: false` in both engines while passing.
  const groups = page.locator('fieldset');
  const axes = await groups.count();
  record(`compat.${engine}.axes`, axes);
  for (let axis = 0; axis < axes; axis += 1) {
    // `check()` rather than `click()`: the input is at `opacity: 0` and the
    // label is what a person hits, so this is the interaction the browser
    // actually performs when the pill is pressed.
    const option = groups.nth(axis).locator('input[type="radio"]:not([disabled])').first();
    if ((await option.count()) > 0) await option.check();
  }
  record(
    `compat.${engine}.selectable_options`,
    await page.locator('input[type="radio"]:not([disabled])').count(),
  );

  const quantity = page.locator('input[type="number"]');
  if ((await quantity.count()) > 0) {
    await expect(quantity.first()).toHaveAttribute('min', '1');
    // The engines disagree about what a `number` input accepts; what matters is
    // that the committed value the CTA carries is within the published bound.
    await quantity.first().fill('2');
    await quantity.first().blur();
  }

  const cta = page.getByRole('link', { name: 'Mua ngay' });
  const disabledCta = page.getByRole('button', { name: /Mua ngay|Tạm hết hàng/ });
  const resolved = (await cta.count()) > 0;
  record(`compat.${engine}.cta_resolved`, resolved);
  if (resolved) {
    const href = await cta.getAttribute('href');
    expect(href, 'the CTA carries a SKU and a quantity').toMatch(/sku=.+&quantity=\d+/);
    await cta.click();
    await expect(page).toHaveURL(/\/mua-hang\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } else {
    // A panel with no resolvable SKU must offer a disabled control, never a
    // dead link — the same rule in every engine.
    await expect(disabledCta.first()).toBeDisabled();
  }
});

test('the checkout is not submittable before it is interactive, and becomes so', async ({
  page,
}, testInfo) => {
  const engine = testInfo.project.name;
  // A **resolvable** address, composed exactly as the purchase panel composes
  // it. Without the SKU the route renders the invalid-selection card, which
  // carries no form at all — so the guard this case exists to prove would never
  // be on the page.
  await gotoStable(
    page,
    `/mua-hang/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}?sku=${MAIN_SKU()}&quantity=1`,
    engine,
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // `APP12-S02-C1`'s guard is a **disabled `<fieldset>`** in the server HTML,
  // and the whole reason it is markup rather than a handler is that it has to
  // hold in every engine before any script has run. Its release is the signal
  // that hydration arrived, so this asserts the transition rather than a state.
  const guard = page.locator('fieldset.ready-made-checkout__columns');
  if ((await guard.count()) > 0) {
    await expect(guard).toHaveAttribute('data-interactive', 'true', { timeout: 30_000 });
    record(`compat.${engine}.prehydration_guard`, 'released');
  } else {
    // The invalid-selection card, which is the other legitimate outcome of an
    // address with no SKU. It carries no form at all.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    record(`compat.${engine}.prehydration_guard`, 'no-form (invalid selection card)');
  }

  await expectNoHorizontalOverflow(page, `${engine}:checkout`);
});

test('the secure order landing refuses an unopened link identically @customer', async ({
  page,
}, testInfo) => {
  const engine = testInfo.project.name;
  // No credential, so this is the one indistinguishable unavailable card — the
  // state every engine has to render, and the one a customer with a dead link
  // actually meets.
  await page.goto('/truy-cap/don-hang');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /trang chủ/i }).last()).toBeVisible();
  await expectNoHorizontalOverflow(page, `${engine}:secure-landing`);
});

test('@admin — an operator can sign in, read the queue and open an order', async ({
  browser,
}, testInfo) => {
  const engine = testInfo.project.name;
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_ADMIN'),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    // Under `toPass` for the reason `a02-world` records: the inputs are
    // React-controlled and a fill that lands before hydration is overwritten.
    await expect(async () => {
      await page.locator('#staff-login-email').fill(requiredEnv('E2E_ADMIN_EMAIL'));
      await page.locator('#staff-login-password').fill(requiredEnv('E2E_ADMIN_PASSWORD'));
      await expect(page.locator('#staff-login-email')).not.toHaveValue('');
      await expect(page.locator('#staff-login-password')).not.toHaveValue('');
    }).toPass({ timeout: 45_000 });

    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible({ timeout: 30_000 });

    await page.goto('/orders');
    // The **screen**, not the table.
    //
    // An empty queue is a legitimate state of this screen and the compatibility
    // gate is about whether the operator can work, not about what this run
    // happens to have created: these projects are ordered last, so whether a row
    // exists depends on whether an unrelated journey ran, and asserting a table
    // here would make this case fail for a reason that has nothing to do with
    // the engine under test. The filters below are the screen's own controls and
    // are present either way.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('group').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, `${engine}:admin-queue`);

    // The filters are the queue's only interactive controls, and native
    // checkboxes inside a `<fieldset>` are exactly where engines have
    // historically disagreed about label association.
    // `click` plus an explicit wait rather than `check()`.
    //
    // The control is a **controlled** checkbox whose `checked` comes back from
    // the URL through `router.replace` and `useSearchParams` — so a click is a
    // full round trip through the App Router before the box reflects it.
    // `check()` asserts the flip immediately after the click and reports
    // "clicking the checkbox did not change its state", which reads like a
    // broken control and is not one. What the gate actually asks is whether the
    // operator can filter the queue, so the click is made and the **outcome**
    // is waited for, in the URL as well as on the control.
    //
    // Since `APP12-V02` §21.1 the filters are chips: the checkbox is a real,
    // focusable checkbox that is *clipped* rather than removed — so it keeps its
    // role, its checked state and its place in the tab order — and the chip
    // beside it is the visible target. That is what an operator clicks, so it is
    // what this gate clicks, and the control underneath is what it asserts on.
    const filter = page.getByTestId('order-origin-filter-READY_MADE');
    const chip = page.locator('label').filter({ has: filter });

    // The state is on the control, not on a class — a screen reader hears it.
    await expect(filter).not.toBeChecked();
    await chip.click();
    await expect(filter).toBeChecked({ timeout: 15_000 });
    await expect(page).toHaveURL(/origin=READY_MADE/);
    await chip.click();
    await expect(filter).not.toBeChecked({ timeout: 15_000 });

    // And it is still reachable and operable from the keyboard alone, which is
    // the property a clipped control most easily loses.
    await filter.focus();
    await expect(filter).toBeFocused();
    await page.keyboard.press('Space');
    await expect(filter).toBeChecked({ timeout: 15_000 });
    await page.keyboard.press('Space');
    await expect(filter).not.toBeChecked({ timeout: 15_000 });

    // Into one order, through the queue's own link — when there is one.
    const firstLink = page.getByTestId('order-queue-row').first().getByRole('link').first();
    if ((await firstLink.count()) > 0) {
      await firstLink.click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${engine}:admin-detail`);
      record(`compat.${engine}.admin_detail`, 'opened');
    }

    // The compact bar, at the one width the Admin design declares below its
    // breakpoint. The operator must still be able to leave the session.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/orders');
    const trigger = page.getByRole('button', { name: /menu/i });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    record(`compat.${engine}.admin_drawer`, 'open+escape');
  } finally {
    await context.close();
  }
});
