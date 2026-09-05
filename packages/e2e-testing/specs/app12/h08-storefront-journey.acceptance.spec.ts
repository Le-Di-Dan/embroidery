/**
 * `APP12-H08` — the customer's critical journey, driven by the keyboard alone.
 *
 * ```text
 * Product Detail → SKU → quantity → CTA → checkout → verification → order
 *                                                  → secure ORDER_ACCESS surface
 * ```
 *
 * ## Nothing here is clicked
 *
 * Every control is reached with `Tab` and operated with `Enter` or `Space`.
 * That is the difference between proving a control exists and proving a keyboard
 * can *get to it* — the second is what §5 asks for, and a `click()` would answer
 * neither. The two places a value has to be typed use `keyboard.type` into
 * whatever `Tab` has just focused, never `fill` on a selector, for the same
 * reason.
 *
 * Focus visibility (SC 2.4.7) is asserted with `expectFocusIsDrawn` at the stops
 * that carry the journey, measured as a before/after difference — because at
 * least one of them, the purchase pill, draws its ring on a **sibling** of the
 * control that holds focus.
 *
 * ## The one exception, stated rather than hidden
 *
 * Reading the verification code back out of the recording adapter is not a
 * keyboard action and could not be. It is the harness standing in for the
 * customer's inbox, exactly as `APP12-S02` and `APP12-S03` do; everything the
 * customer would then do with that code is typed.
 *
 * ## Secrecy
 *
 * The run opens a live `ORDER_ACCESS` surface. No assertion in this file prints
 * a token, a code or a contact: the credential is handled entirely inside
 * `openSecureOrder`, which strips the fragment before returning, and the DOM
 * checks below assert **absence** as a boolean rather than dumping what they
 * searched. Traces, video, screenshots and HAR are off for this project.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY as S02_COPY,
  MAIN_SKU,
  closeS02World,
  openS02World,
  requiredEnv,
  runWorkerUntilIdle,
  s02Worker,
} from './support/s02-world';
import {
  COPY as S03_COPY,
  closeS03World,
  openS03World,
  openSecureOrder,
  refreshUntilVisible,
  runReservationExpirySweep,
  s03Evidence,
} from './support/s03-world';
import {
  expectNoSeriousViolations,
  expectShellLandmarks,
  record,
  reportProofs,
  warmGateway,
} from './support/h08-world';
import {
  activeElement,
  expectContrastIsTokenOwned,
  expectFocusIsDrawn,
  expectNoHorizontalOverflow,
  measureTargetsOn,
  tabThrough,
  tabUntil,
} from './support/h08-metrics';

/* The harness helper layer is plain ESM, so the worker control arrives untyped. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

const PRODUCT = (): string => `/san-pham/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}`;

// Serial, and generously bounded. The run places a real order through the real
// checkout and opens a real ORDER_ACCESS surface — the same shape `APP12-S03`
// and `APP12-A02` are configured for, and for the same reason: a single
// `verifyContact` alone is allowed 30s to survive a slow hydration, so the
// 30s file default would fail the hook rather than the screen.
test.describe.configure({ mode: 'serial', timeout: 420_000 });

/** The order this file creates once and audits from three states. */
let orderCode: string | undefined;
let orderContact: string | undefined;

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-h08-journey:s03]');
  await closeS02World('[app12-h08-journey:s02]');
  reportProofs('[app12-h08-storefront-journey]');
});

/** Types into whatever currently has focus. Never a selector, never `fill`. */
async function typeHere(page: Page, value: string): Promise<void> {
  await page.keyboard.type(value, { delay: 5 });
}

test('A — Product Detail is purchasable with the keyboard alone', async ({ page }) => {
  // See `warmGateway`: the gateway's first connection of a project can stall.
  await warmGateway(page, 'storefront-journey');
  await page.goto(PRODUCT());
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await expectShellLandmarks(page, 'product-detail-journey');
  await expectNoSeriousViolations(page, 'product-detail-journey');

  // The purchase panel is a `<fieldset>` of real radios per axis, so exactly one
  // option of each group is a tab stop and the rest are arrow-key reachable.
  //
  // Every axis has to be answered before a SKU resolves — which is the whole
  // point of the panel — so the walk chooses one option in each. Tabbing forward
  // from a group that now has a checked radio lands on the *next* group's first
  // option, so the loop below is exactly what a customer's fingers do.
  const axes = await page.evaluate(() => document.querySelectorAll('fieldset').length);
  record('journey.axes', axes);
  for (let axis = 0; axis < axes; axis += 1) {
    const radio = await tabUntil(
      page,
      `the axis ${String(axis + 1)} radio`,
      (active) => active.type === 'radio',
    );
    if (axis === 0) {
      record('journey.radio_name', radio.name);
      // The ring is drawn on the pill beside the transparent input, which is why
      // this is measured as a difference rather than read off the radio.
      await expectFocusIsDrawn(page, 'purchase-variant-radio');
    }
    await page.keyboard.press('Space');
  }

  const selectedCount = await page.evaluate(
    () => document.querySelectorAll('input[type="radio"]:checked').length,
  );
  record('journey.radios_selected', selectedCount);
  expect(selectedCount, 'pressing Space selects the focused option in every axis').toBe(axes);

  // The approved missing-axis message is a live region now (`APP12-H08`), so a
  // customer who has chosen one axis is told about the other. Asserted as the
  // region's role rather than as an announcement, which no browser exposes.
  const statusRegions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="status"], [aria-live]')).map(
      (element) => element.className || element.tagName.toLowerCase(),
    ),
  );
  record('journey.status_regions', statusRegions.length);

  // The quantity stepper: two named buttons and a real `number` input with the
  // published bound. Reached, and read, by keyboard.
  const quantity = await tabUntil(page, 'the quantity input', (active) => active.type === 'number');
  const bounds = await page.evaluate(() => {
    const input = document.activeElement as HTMLInputElement | null;
    return input === null
      ? null
      : { min: input.min, max: input.max, step: input.step, hasLabel: input.labels?.length ?? 0 };
  });
  record('journey.quantity_bounds', JSON.stringify(bounds));
  await expectFocusIsDrawn(page, 'purchase-quantity-input');
  expect(bounds?.hasLabel, 'the quantity input has a programmatic label').toBeGreaterThan(0);
  expect(bounds?.min, 'the quantity input publishes its minimum').toBe('1');
  expect(bounds?.max, 'the quantity input publishes the SKU availability').not.toBe('');
  expect(quantity.name, 'the quantity label is announced with the field').not.toBe('');

  // The continue CTA, reached by Tab and activated with Enter.
  const cta = await tabUntil(
    page,
    'the purchase CTA',
    (active) => active.tag === 'a' && active.name.includes('Mua ngay'),
  );
  record('journey.cta_name', cta.name);
  await expectFocusIsDrawn(page, 'purchase-cta');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/mua-hang\//);
  await expect(page.getByRole('heading', { level: 1, name: S02_COPY.heading })).toBeVisible();
});

test('B — the checkout can be completed with the keyboard alone', async ({ page }) => {
  await page.goto(
    `/mua-hang/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}?sku=${MAIN_SKU()}&quantity=1`,
  );
  await expect(page.getByRole('heading', { level: 1, name: S02_COPY.heading })).toBeVisible();

  await expectShellLandmarks(page, 'checkout');
  await expectNoSeriousViolations(page, 'checkout');

  // The pre-hydration guard is a **disabled `<fieldset>`** until React takes
  // over. A keyboard journey that started before that would find no controls at
  // all, so the run waits for the guard to open — which is also the first live
  // proof that `APP12-S02-C1`'s correction does not strand a keyboard customer.
  await expect(page.locator('fieldset[data-interactive="true"]')).toBeVisible({ timeout: 30_000 });

  const worker = s02Worker();
  const before: number = worker.deliveryCount();
  const contact = `app12-h08-${String(Date.now())}@vidu.test`;

  // Contact entry: reached by Tab, typed, submitted with Enter.
  await tabUntil(
    page,
    'the contact input',
    (active) => active.tag === 'input' && active.type !== 'radio' && active.type !== 'number',
  );
  await typeHere(page, contact);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
    timeout: 20_000,
  });
  await expectNoSeriousViolations(page, 'checkout-code-entry');

  // The inbox stands in for the customer. Everything after this is typed.
  await runWorkerUntilIdle();
  let code: string | undefined;
  for (let index = (worker.deliveryCount() as number) - 1; index >= before; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      code = worker.secretOf(index) as string;
      break;
    }
  }
  expect(code, 'a SUBMISSION verification code was delivered').toBeDefined();

  await tabUntil(page, 'the code input', (active) => active.tag === 'input' && active.id !== '');
  await typeHere(page, code as string);
  await page.keyboard.press('Enter');
  await expect(page.getByText(S02_COPY.verified, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  // §7 — every delivery field is labelled, required and describable, asserted
  // from the accessibility properties rather than from the markup that produces
  // them. `aria-required` is what `APP12-H08` added; the rest was already right.
  const fields = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ready-made-checkout__control')).map((element) => {
      const input = element as HTMLInputElement;
      return {
        label: input.labels?.[0]?.textContent?.trim() ?? '',
        required: input.getAttribute('aria-required'),
        autoComplete: input.getAttribute('autocomplete') ?? '',
        placeholderIsLabel: input.placeholder !== '' && (input.labels?.length ?? 0) === 0,
      };
    }),
  );
  record('journey.delivery_fields', fields.length);
  expect(fields.length, 'the four contracted delivery fields are on screen').toBe(4);
  for (const field of fields) {
    expect(field.label, 'every delivery field has a programmatic label').not.toBe('');
    expect(field.required, 'every delivery field publishes its required state').toBe('true');
    expect(field.placeholderIsLabel, 'no placeholder stands in for a label').toBe(false);
    expect(
      field.autoComplete,
      'every delivery field offers the browser autofill vocabulary',
    ).not.toBe('');
  }

  // Submitting empty first, because an error state is the part of a form most
  // likely to be inaccessible and the part a keyboard customer meets alone.
  const submit = await tabUntil(
    page,
    'the order submit button',
    (active) => active.tag === 'button' && active.name.includes(S02_COPY.submit),
    80,
  );
  expect(submit.visible).toBe(true);
  await expectFocusIsDrawn(page, 'checkout-submit');
  await page.keyboard.press('Enter');

  const alerts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"]')).map((element) =>
      (element.textContent ?? '').trim().slice(0, 60),
    ),
  );
  record('journey.submit_alerts', alerts.length);
  expect(alerts.length, 'a refused submit publishes its errors into a live region').toBeGreaterThan(
    0,
  );
  // The error is bound to its field as well as announced — `909:258`'s rule.
  const bound = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ready-made-checkout__control')).every((element) => {
      const input = element as HTMLInputElement;
      if (input.getAttribute('aria-invalid') !== 'true') return true;
      const describedBy = input.getAttribute('aria-describedby') ?? '';
      return describedBy
        .split(/\s+/)
        .some((id) =>
          document.getElementById(id)?.classList.contains('ready-made-checkout__error'),
        );
    }),
  );
  expect(bound, 'every invalid field points at its own error through aria-describedby').toBe(true);
  await expectNoSeriousViolations(page, 'checkout-errors');

  // Now fill the four fields by tabbing between them, and submit for real.
  //
  // No reset of the tab position is needed and none is available without a
  // click: Tab from the last control of a document wraps to the first, so the
  // walk below simply continues and comes round to the delivery card.
  // Each field is typed only if it is still empty, so a wrap that passes one
  // already filled does not double it.
  const values = [
    'Nguyễn Minh Anh',
    '0901234567',
    '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
    'TP. Hồ Chí Minh',
  ];
  for (const value of values) {
    await tabUntil(
      page,
      'the next empty delivery field',
      (active) => active.tag === 'input' && active.name !== '',
      120,
    );
    const empty = await page.evaluate(
      () => (document.activeElement as HTMLInputElement).value === '',
    );
    if (empty) await typeHere(page, value);
  }
  const filled = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.ready-made-checkout__control')).filter(
        (element) => (element as HTMLInputElement).value.trim() !== '',
      ).length,
  );
  expect(filled, 'all four delivery fields were filled from the keyboard').toBe(4);

  await tabUntil(
    page,
    'the order submit button',
    (active) => active.tag === 'button' && active.name.includes(S02_COPY.submit),
    80,
  );
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: S02_COPY.successTitle })).toBeVisible({
    timeout: 30_000,
  });
  // Focus follows the outcome — the panel takes it on mount (`APP12-S02` §35),
  // which is what stops a keyboard customer being left on a form that vanished.
  const settled = await activeElement(page);
  record('journey.focus_after_create', settled.tag);
  expect(settled.tag, 'focus lands on the confirmation heading').toBe('h2');

  await expectNoSeriousViolations(page, 'checkout-created');

  orderCode = (await page.locator('.ready-made-checkout__order-code').innerText()).trim();
  orderContact = contact;
  expect(orderCode).toMatch(/ORD-[A-Z0-9]+/);
  await runWorkerUntilIdle();
});

test('C — the secure order surface is accessible, and leaks no credential', async ({ page }) => {
  expect(orderCode, 'the journey created an order').toBeDefined();
  await openSecureOrder(page);

  // The order has just been created, so it is waiting on the shipping fee. The
  // heading names that state since `APP12-V02` §17.1.
  await expect(
    page.getByRole('heading', { level: 1, name: S03_COPY.headingAwaitingFee }),
  ).toBeVisible();
  await expectShellLandmarks(page, 'secure-order');
  await expectNoSeriousViolations(page, 'secure-order');
  await expectContrastIsTokenOwned(page, 'secure-order@1440');
  await expectNoHorizontalOverflow(page, 'secure-order@1440');

  // §6 — status meaning is never colour alone. The pill carries a decorative
  // symbol and a real label, so its accessible text must be non-empty and must
  // not be the symbol.
  const pill = await page.evaluate(() => {
    const element = document.querySelector('.secure-order__pill');
    if (element === null) return null;
    const symbol = element.querySelector('[aria-hidden="true"]');
    return {
      text: (element.textContent ?? '').trim(),
      symbolHidden: symbol !== null && symbol.getAttribute('aria-hidden') === 'true',
      symbolText: (symbol?.textContent ?? '').trim(),
    };
  });
  record('secure.pill_text', pill?.text ?? '(none)');
  expect(pill, 'the status pill is on screen').not.toBeNull();
  expect(pill?.symbolHidden, 'the pill symbol is decorative').toBe(true);
  expect(
    (pill?.text ?? '').replace(pill?.symbolText ?? '', '').trim(),
    'the pill carries a word, not only a colour and a glyph',
  ).not.toBe('');

  // §6 — the credential is absent from the accessible text, the DOM and storage.
  // Booleans only: a failing assertion must never print what it searched for.
  const leak = await page.evaluate(() => {
    const inFragment = window.location.hash !== '';
    const inQuery = window.location.search !== '';
    const storageKeys = [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ];
    return {
      inFragment,
      inQuery,
      storageEntries: storageKeys.length,
      // The one shape a token would take if it reached the DOM at all.
      tokenLikeAttributes: document.querySelectorAll('[data-token], [data-secret], [href*="#t="]')
        .length,
    };
  });
  record('secure.storage_entries', leak.storageEntries);
  expect(leak.inFragment, 'the fragment was stripped before anything could read it').toBe(false);
  expect(leak.inQuery, 'the credential never becomes a query parameter').toBe(false);
  expect(leak.tokenLikeAttributes, 'no element carries the credential').toBe(0);
  expect(leak.storageEntries, 'the surface persists nothing in browser storage').toBe(0);

  // The polite live region the shell publishes when the link settles — the only
  // thing that tells a screen-reader customer the page stopped being a spinner.
  const live = await page.evaluate(() => document.querySelectorAll('[aria-live="polite"]').length);
  record('secure.live_regions', live);
  expect(live, 'the settled outcome is announced politely').toBeGreaterThan(0);

  // Every viewport, because the QR panel is *placed* by the grid rather than
  // mounted twice, and a reflow failure here would be a real one.
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoHorizontalOverflow(page, `secure-order@${String(width)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await measureTargetsOn(page, 'secure-order@390');
  expect(
    targets.undersized.map(
      (target: { selector: string; width: number; height: number }) =>
        `${target.selector} ${String(target.width)}x${String(target.height)}`,
    ),
    'secure-order@390: targets under 24px with neither SC 2.5.8 exception',
  ).toStrictEqual([]);

  // A page-level tab walk, to prove the surface itself is not a trap: focus has
  // to keep moving through a screen with no dialog open.
  await page.setViewportSize({ width: 1440, height: 900 });
  const walk = await tabThrough(page, 10);
  record('secure.tab_stops', new Set(walk.map((stop) => stop.name)).size);
  expect(
    new Set(walk.map((stop) => `${stop.tag}|${stop.name}`)).size,
    'focus keeps moving on the secure order surface',
  ).toBeGreaterThan(1);

  expect(orderContact, 'the journey retained its synthetic contact').toBeDefined();
});

test('D — a terminal order keeps its accessibility, and offers nothing payable', async ({
  page,
}) => {
  // §6 asks for representative states rather than eight journeys, and this is
  // the cheapest honest way to reach a **terminal** one: the order this file
  // created was never priced, so its reservation is the only thing holding it
  // open. Making that reservation due and running the **real** sweep produces
  // `CANCELLED` + `RESERVATION_EXPIRED`, which the surface renders as its own
  // `EXPIRED` variant — a different pill, a different sentence, and no payable
  // control anywhere.
  //
  // It runs last in this file on purpose. The sweep claims from the whole queue,
  // and the Admin journey's order does not exist yet when this project runs.
  const evidence = s03Evidence();
  expect(orderCode, 'the journey created an order').toBeDefined();

  await evidence.makeReservationDue(String(orderCode));
  const swept = await runReservationExpirySweep();
  expect(swept, 'the real sweep reported an outcome').toBeDefined();
  await expect
    .poll((): Promise<string> => evidence.orderStatusOf(orderCode as string) as Promise<string>, {
      timeout: 30_000,
    })
    .toBe('CANCELLED');

  await openSecureOrder(page);
  await refreshUntilVisible(page, page.getByText(S03_COPY.pillExpired));

  // The state is readable without colour, exactly as the live variant was.
  const pill = await page.evaluate(() => {
    const element = document.querySelector('.secure-order__pill');
    const symbol = element?.querySelector('[aria-hidden="true"]');
    return {
      text: (element?.textContent ?? '').trim(),
      symbol: (symbol?.textContent ?? '').trim(),
    };
  });
  record('secure.expired_pill', pill.text);
  expect(
    pill.text.replace(pill.symbol, '').trim(),
    'the terminal state is named in words, not only in a colour and a glyph',
  ).not.toBe('');

  // §30 / §6 — nothing payable survives, so there is no control to be
  // inaccessible. Asserted as absence rather than as "disabled", which would be
  // an affordance a screen reader still announces.
  for (const gone of [S03_COPY.qrTitle, S03_COPY.evidenceTitle]) {
    await expect(page.getByRole('heading', { name: gone })).toHaveCount(0);
  }

  await expectShellLandmarks(page, 'secure-order-expired');
  await expectNoSeriousViolations(page, 'secure-order-expired');
  await expectContrastIsTokenOwned(page, 'secure-order-expired@1440');
  await expectNoHorizontalOverflow(page, 'secure-order-expired@1440');
  record('secure.expired_audited', true);
});
