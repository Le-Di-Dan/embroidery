/**
 * `APP12-H08` — the operator's critical journey, driven by the keyboard alone.
 *
 * ```text
 * login → Orders queue → Ready-Made detail → shipping fee
 *       → FULL payment review / verification → dispatch → completion
 * ```
 *
 * ## What is keyboard-driven and what is setup
 *
 * Everything the **operator** does is keyboard-driven: the login form, the
 * queue's filters, the link into the detail, the fee field, the verification
 * dialog and the two fulfilment confirmations. The customer half — placing the
 * order and opening a payment attempt — is setup, and it runs through the
 * delivered checkout in its own context with the S02/S03 helpers, because the
 * customer's keyboard journey is proved in `h08-storefront-journey` and
 * re-proving it here would double the most expensive part of the run to assert
 * the same thing twice.
 *
 * ## The Admin has two viewports, not three
 *
 * `APP12-D01` §L draws the operator tool at 1440 and 1024 and no mobile. The
 * compact app bar and its drawer are still audited — they are what the PO
 * restructure introduced and what §4 asks about — but at the widths the design
 * actually declares.
 *
 * ## Secrecy
 *
 * The operator password is read from the child environment and typed into the
 * real form. It is never returned, asserted on, recorded in `proofs` or printed,
 * and this project runs with trace, video, screenshot and HAR off.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  COPY as A02_COPY,
  ORDERS_PATH,
  openFullPaymentAttempt,
  queueRow,
  requiredEnv,
  storefrontOrigin,
  submitShippingFee,
} from './support/a02-world';
import { closeS02World, openS02World, runWorkerUntilIdle } from './support/s02-world';
import {
  COPY as S03_COPY,
  closeS03World,
  openS03World,
  openSecureOrder,
  placeOrder,
  s03Evidence,
} from './support/s03-world';
import {
  expectNoSeriousViolations,
  expectShellLandmarks,
  record,
  reportProofs,
  scanBestPractice,
  warmGateway,
} from './support/h08-world';
import { activeElement, expectFocusIsDrawn, tabThrough, tabUntil } from './support/h08-metrics';
import { watchSecureOrder, type SecureOrderWatch } from './support/h08-secure-states';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

const FEE = '45000.00';

// Serial, and generously bounded, for the reason the Storefront journey records:
// the setup places a real order through the real checkout, which is allowed 30s
// on its own for hydration alone.
test.describe.configure({ mode: 'serial', timeout: 420_000 });

/**
 * The operator's session, opened once for the whole file.
 *
 * **Not the `page` fixture.** Playwright creates and closes that per test, so a
 * module-level `operator = page` in the first case hands every later case a
 * closed target — which is exactly what it did, and it fails as
 * "Target page, context or browser has been closed" on the next `goto` rather
 * than as anything to do with the Admin. A serial journey that logs in once and
 * then works one order across six cases has to own its own context.
 */
let context: BrowserContext;
let operator: Page;
let placedCode: string | undefined;
let placedContact: string | undefined;
/**
 * The customer's own tab on the secure surface, opened once and re-read as the
 * operator moves the order. See `h08-secure-states.ts` for why it is one tab.
 */
let secureWatch: SecureOrderWatch | undefined;

test.beforeAll(async ({ browser }) => {
  await openS02World();
  await openS03World();

  // The customer half, in its own context on the Storefront origin.
  const shopper = await browser.newContext({
    baseURL: storefrontOrigin(),
    viewport: { width: 1440, height: 900 },
  });
  const shopperPage = await shopper.newPage();
  // The gateway's first connection after an idle period can stall past its
  // 10s connect timeout — see `warmGateway`. Opened here, before the checkout,
  // because a 504 on `placeOrder` reads like a missing contact field.
  await warmGateway(shopperPage, 'admin-journey-shopper');
  const placed = await placeOrder(shopperPage);
  placedCode = placed.orderCode;
  placedContact = placed.contact;
  await shopper.close();

  // The operator's own context, **unauthenticated**: case A signs in through the
  // real form with the keyboard, which is the subject rather than the setup.
  context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_ADMIN'),
    viewport: { width: 1440, height: 900 },
  });
  operator = await context.newPage();
});

test.afterAll(async () => {
  await secureWatch?.close();
  await context?.close();
  await closeS03World('[app12-h08-admin:s03]');
  await closeS02World('[app12-h08-admin:s02]');
  reportProofs('[app12-h08-admin-journey]');
});

test('A — an operator signs in with the keyboard alone', async () => {
  const page = operator;
  // The Admin origin's own first connection through the gateway (see
  // `warmGateway`); the shopper's was opened in `beforeAll`.
  await warmGateway(page, 'admin-operator');
  await page.goto('/login');

  await expectShellLandmarks(page, 'admin-login');
  await expectNoSeriousViolations(page, 'admin-login');
  await scanBestPractice(page, 'admin-login');

  // The two fields are React-controlled, so a value typed before hydration is
  // overwritten when the client takes the DOM over — the same trap `a02-world`
  // records. `toPass` retries the whole keyboard sequence rather than the fill.
  await expect(async () => {
    await page.goto('/login');
    const email = await tabUntil(
      page,
      'the email field',
      (active) => active.tag === 'input' && active.type !== 'checkbox',
      20,
    );
    expect(email.name, 'the email field is labelled').not.toBe('');
    await page.keyboard.type(requiredEnv('E2E_ADMIN_EMAIL'), { delay: 5 });
    await page.keyboard.press('Tab');
    await page.keyboard.type(requiredEnv('E2E_ADMIN_PASSWORD'), { delay: 5 });
    await expect(page.locator('#staff-login-email')).not.toHaveValue('');
    await expect(page.locator('#staff-login-password')).not.toHaveValue('');
  }).toPass({ timeout: 45_000 });

  // The password field must be a real password input with its own label, and
  // the visibility toggle must be a named button rather than a bare glyph.
  const password = await page.evaluate(() => {
    const input = document.querySelector('#staff-login-password');
    if (input === null) return null;
    const field = input as HTMLInputElement;
    return {
      type: field.type,
      label: field.labels?.[0]?.textContent?.trim() ?? '',
      autoComplete: field.autocomplete,
    };
  });
  record('admin.password_type', password?.type ?? '(none)');
  expect(password?.type, 'the password is not rendered in the clear').toBe('password');
  expect(password?.label, 'the password field is labelled').not.toBe('');

  await expectFocusIsDrawn(page, 'admin-login-password');

  // Submitted with Enter from the field, which is the implicit-submission path
  // an operator actually uses.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible({ timeout: 30_000 });
});

test('B — the queue is a real table an operator can drive by keyboard', async () => {
  await operator.goto(ORDERS_PATH);
  await expect(operator.getByTestId('order-queue-table')).toBeVisible();

  await expectShellLandmarks(operator, 'admin-queue');
  await expectNoSeriousViolations(operator, 'admin-queue');
  await scanBestPractice(operator, 'admin-queue');

  // §9 — the table keeps its header/cell relationships. Asserted from the
  // structure assistive technology reads, not from the class names.
  const table = await operator.evaluate(() => {
    const element = document.querySelector('[data-testid="order-queue-table"]');
    if (element === null) return null;
    const first = element.querySelector('tbody tr');
    return {
      caption: element.querySelector('caption')?.textContent?.trim() ?? '',
      columnHeaders: Array.from(element.querySelectorAll('thead th[scope="col"]')).length,
      headerlessColumns: Array.from(element.querySelectorAll('thead th:not([scope])')).length,
      rowHeaders: Array.from(element.querySelectorAll('tbody th[scope="row"]')).length,
      cellsInFirstRow: first === null ? 0 : first.querySelectorAll('td, th').length,
    };
  });
  record('admin.queue_columns', table?.columnHeaders ?? 0);
  record('admin.queue_caption', table?.caption ?? '(none)');
  expect(table?.caption, 'the queue table is named by its caption').not.toBe('');
  expect(table?.columnHeaders, 'every column has a scoped header').toBeGreaterThan(0);
  expect(table?.headerlessColumns, 'no column header is missing its scope').toBe(0);
  expect(table?.rowHeaders, 'each row is identified by its order code').toBeGreaterThan(0);
  expect(table?.cellsInFirstRow, 'the first row has one cell per column').toBe(
    table?.columnHeaders,
  );

  // The two filters are `fieldset` + native checkboxes, so a keyboard drives
  // them with no interaction code at all. Reached and toggled with Space.
  const originFilter = await tabUntil(
    operator,
    'the Ready-Made origin filter',
    (active) => active.tag === 'input' && active.type === 'checkbox',
    60,
  );
  record('admin.first_filter', originFilter.name);
  expect(originFilter.name, 'each filter checkbox is labelled').not.toBe('');
  await expectFocusIsDrawn(operator, 'admin-queue-filter');

  const groups = await operator.evaluate(() =>
    Array.from(document.querySelectorAll('fieldset')).map(
      (fieldset) => fieldset.querySelector('legend')?.textContent?.trim().slice(0, 40) ?? '(none)',
    ),
  );
  record('admin.filter_groups', groups.join('|'));
  expect(groups.length, 'both filters are named groups').toBeGreaterThanOrEqual(2);
  for (const legend of groups) {
    expect(legend, 'every filter group has a visible legend').not.toBe('(none)');
  }

  // Into the order, through the queue's own link — reached by Tab, opened with
  // Enter. This is also the §9 proof that a row is navigated by an explicit
  // named link rather than by a clickable row a keyboard cannot reach.
  expect(placedCode).toBeDefined();
  const row = queueRow(operator, placedCode as string);
  await expect(row).toBeVisible();
  const link = await tabUntil(
    operator,
    'the order-code link',
    (active) => active.tag === 'a' && active.name.includes(String(placedCode)),
    120,
  );
  expect(link.name, 'the row link names the order it opens').toContain(placedCode as string);
  await expectFocusIsDrawn(operator, 'admin-queue-row-link');
  await operator.keyboard.press('Enter');
  await expect(
    operator.getByRole('heading', { level: 1, name: placedCode as string }),
  ).toBeVisible();
});

test('C — the shipping fee is set from the keyboard, and its refusal is announced', async ({
  browser,
}) => {
  await expectShellLandmarks(operator, 'admin-order-detail');
  await expectNoSeriousViolations(operator, 'admin-order-detail');

  // §7 — the fee field is labelled, carries its required marker inside the
  // label, and points at its own help/error through `aria-describedby`.
  const field = await operator.evaluate(() => {
    const input = document.querySelector('[data-testid="shipping-fee-input"]');
    if (input === null) return null;
    const control = input as HTMLInputElement;
    const describedBy = control.getAttribute('aria-describedby') ?? '';
    return {
      label: control.labels?.[0]?.textContent?.trim() ?? '',
      described: describedBy !== '' && document.getElementById(describedBy) !== null,
      invalid: control.getAttribute('aria-invalid'),
      placeholderOnly: control.placeholder !== '' && (control.labels?.length ?? 0) === 0,
    };
  });
  record('admin.fee_label', field?.label ?? '(none)');
  expect(field?.label, 'the fee field is labelled and states that it is required').not.toBe('');
  expect(field?.described, 'the fee field points at its own help text').toBe(true);
  expect(field?.placeholderOnly, 'no placeholder stands in for the fee label').toBe(false);

  // The empty-submit refusal, which `APP12-H08` made a live region: the operator
  // presses the button and focus stays on it, so an error that only changed some
  // text in place was never spoken.
  const submit = await tabUntil(
    operator,
    'the fee submit button',
    (active) => active.tag === 'button' && active.name.includes(A02_COPY.confirmFee),
    120,
  );
  expect(submit.visible).toBe(true);
  await expectFocusIsDrawn(operator, 'admin-fee-submit');
  await operator.keyboard.press('Enter');

  const alerts = await operator.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"]')).map((element) =>
      (element.textContent ?? '').trim().slice(0, 40),
    ),
  );
  record('admin.fee_refusal_alerts', alerts.length);
  expect(alerts.length, 'an empty fee is refused into a live region').toBeGreaterThan(0);
  await expect(operator.locator('[data-testid="shipping-fee-input"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expectNoSeriousViolations(operator, 'admin-fee-invalid');

  // Now the real save, still from the keyboard.
  await tabUntil(
    operator,
    'the fee field',
    (active) =>
      active.tag === 'input' && active.name.includes(A02_COPY.shippingHeading.slice(0, 3)),
    120,
  ).catch(async () => {
    // The label is the design's, not this spec's, so the walk falls back to the
    // delivered test id rather than pinning a copy string that V02 may reword.
    await operator.locator('[data-testid="shipping-fee-input"]').focus();
    return activeElement(operator);
  });
  await submitShippingFee(operator, FEE);
  await expect(operator.getByTestId('full-payment-amount')).toBeVisible({ timeout: 30_000 });

  // The operator's write is what moves the customer's screen, so this is where
  // the AWAITING_PAYMENT state is audited (§6).
  // The operator's write is what moves the customer's screen, so this is where
  // the AWAITING_PAYMENT state is audited (§6). The tab is opened here — after
  // the first write — and every later state is a refresh of it.
  secureWatch = await watchSecureOrder(browser);
  await secureWatch.audit('awaiting-payment', S03_COPY.pillAwaitingPayment);
});

test('D — the payment verification dialog traps focus and gives it back', async ({ browser }) => {
  // The customer opens a real attempt, so the operator has something real to
  // verify. Setup, in the customer's own context.
  const shopper = await browser.newContext({
    baseURL: storefrontOrigin(),
    viewport: { width: 1440, height: 900 },
  });
  const shopperPage = await shopper.newPage();
  await openSecureOrder(shopperPage);
  await openFullPaymentAttempt(shopperPage, placedContact as string);
  await runWorkerUntilIdle();
  await shopper.close();

  await operator.reload();
  await expect(operator.getByTestId('full-attempt-status')).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousViolations(operator, 'admin-payment-panel');

  const opener = await tabUntil(
    operator,
    'the verify control',
    (active) => active.tag === 'button' && active.name.includes(A02_COPY.verify),
    140,
  );
  record('admin.verify_control', opener.name);
  await expectFocusIsDrawn(operator, 'admin-verify-open');
  await operator.keyboard.press('Enter');

  const dialog = operator.getByTestId('verify-dialog');
  await expect(dialog).toBeVisible();
  await expectNoSeriousViolations(operator, 'admin-verify-dialog');

  // The dialog is modal, named by its own heading, and focus is inside it.
  const semantics = await operator.evaluate(() => {
    const element = document.querySelector('[data-testid="verify-dialog"]');
    if (element === null) return null;
    const labelledBy = element.getAttribute('aria-labelledby');
    return {
      role: element.getAttribute('role'),
      modal: element.getAttribute('aria-modal'),
      named:
        labelledBy !== null &&
        (document.getElementById(labelledBy)?.textContent ?? '').trim() !== '',
      focusInside: element.contains(document.activeElement),
    };
  });
  record('admin.verify_dialog_role', semantics?.role ?? '(none)');
  expect(semantics?.role, 'the verification dialog is a dialog').toBe('dialog');
  expect(semantics?.modal, 'it is modal').toBe('true');
  expect(semantics?.named, 'it is named by its own heading').toBe(true);
  expect(semantics?.focusInside, 'focus enters the dialog on open').toBe(true);

  // Tab cannot leave it — in either direction. Backwards is the case that
  // matters: `APP12-H08` found the Storefront frame leaking on exactly this key.
  const forward = await tabThrough(operator, 10);
  const stillInside = await operator.evaluate(() => {
    const element = document.querySelector('[data-testid="verify-dialog"]');
    return element !== null && element.contains(document.activeElement);
  });
  record('admin.verify_tab_stops', new Set(forward.map((stop) => stop.name)).size);
  expect(stillInside, 'Tab never leaves the verification dialog').toBe(true);

  for (let step = 0; step < 10; step += 1) {
    await operator.keyboard.press('Shift+Tab');
  }
  const stillInsideBackwards = await operator.evaluate(() => {
    const element = document.querySelector('[data-testid="verify-dialog"]');
    return element !== null && element.contains(document.activeElement);
  });
  expect(stillInsideBackwards, 'Shift+Tab never leaves the verification dialog').toBe(true);

  // Escape closes it and focus returns to the control that opened it.
  await operator.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const restored = await activeElement(operator);
  record('admin.focus_after_dialog', restored.name);
  expect(restored.name, 'focus returns to the verify control').toContain(A02_COPY.verify);
});

test('E — the verification is taken, and dispatch and completion follow', async () => {
  const evidence = s03Evidence();

  // The expected figures come from the server rather than from scraping a
  // definition row, for the reason `APP12-A02-C1` records: the obligation's own
  // amount is the verification authority, and a mis-parsed screen string is how
  // an exact match becomes a durable mismatch.
  const owed = await evidence.liveFullObligationOf(String(placedCode));
  const observedAmount = String(owed.amount).split('.')[0] ?? '';
  const expectedReference = (
    await operator.getByTestId('full-payment-reference').locator('dd').innerText()
  ).trim();

  await tabUntil(
    operator,
    'the verify control',
    (active) => active.tag === 'button' && active.name.includes(A02_COPY.verify),
    140,
  );
  await operator.keyboard.press('Enter');
  await expect(operator.getByTestId('verify-dialog')).toBeVisible();

  // Typed into whatever already has focus, then `Tab`, then the next — exactly
  // what an operator's hands do, and the reason it is written this way rather
  // than as three searches.
  //
  // `PaymentDialog` puts focus on the dialog's **first** control on open, so a
  // `tabUntil` for "the next field" would step *past* it and shift every value
  // one field along: the amount into the reference, the reference into the note,
  // and the note text into the amount — which the server then refuses as a
  // malformed figure. That is the failure this loop's shape prevents, and it is
  // worth stating because the refusal reads like a bad amount rather than like a
  // misaligned walk.
  const typed: string[] = [];
  const values = [observedAmount, expectedReference, 'Đối chiếu sao kê ngân hàng.'];
  for (let index = 0; index < values.length; index += 1) {
    if (index > 0) await operator.keyboard.press('Tab');
    const field = await activeElement(operator);
    expect(
      field.tag === 'input' || field.tag === 'textarea',
      `dialog stop ${String(index + 1)} is a text field, not a ${String(field.tag)}`,
    ).toBe(true);
    typed.push(field.name);
    await operator.keyboard.type(values[index] ?? '', { delay: 3 });
  }
  record('admin.verify_dialog_fields', typed.join('|'));
  for (const name of typed) {
    expect(name, 'every field in the verification dialog is labelled').not.toBe('');
  }

  // The submit, reached by Tab and pressed with Enter — never `.focus()`, which
  // would prove the handler runs rather than that a keyboard can get there.
  const submitControl = await tabUntil(
    operator,
    'the verification submit',
    (active) => active.tag === 'button' && /Xác nhận/.test(active.name),
    20,
  );
  record('admin.verify_submit_name', submitControl.name);
  await operator.keyboard.press('Enter');

  await expect(operator.getByTestId('payment-outcome')).toHaveAttribute(
    'data-outcome',
    'verified',
    { timeout: 30_000 },
  );
  // §7's async-status requirement, on the one write that moves money: the
  // outcome has to be announced, not only rendered.
  const outcomeLive = await operator.evaluate(() => {
    const element = document.querySelector('[data-testid="payment-outcome"]');
    if (element === null) return null;
    const region = element.closest('[role="status"], [role="alert"], [aria-live]');
    return {
      announced: region !== null,
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  });
  record('admin.verify_outcome_announced', outcomeLive?.announced === true);
  record('admin.verify_outcome_text', outcomeLive?.text ?? '(none)');
  expect(outcomeLive?.announced, 'the verification outcome is announced, not only drawn').toBe(
    true,
  );
  // `V01-UX-006` / `APP12-V02` §24: this order is READY_MADE and carries a FULL
  // obligation, so nothing on the outcome may call the money a deposit. This
  // announcement is the string the live journey caught still saying it after
  // every other visible payment string had already been branched.
  expect(
    outcomeLive?.text ?? '',
    'the settled announcement uses the order origin\x27s own words',
  ).not.toMatch(/tiền cọc/iu);
  expect(await evidence.orderStatusOf(placedCode as string)).toBe('READY_FOR_DELIVERY');
  await expectNoSeriousViolations(operator, 'admin-payment-settled');

  // The customer's screen once the payment is verified (§6).
  await secureWatch?.audit('ready-for-delivery', S03_COPY.pillReadyForDelivery);

  // The dialog **stays open** after the payment settles — `APP12-A02-C1` tests
  // that deliberately, so a lost dialog can never leave an operator with no way
  // to see how a financial decision ended. It is still modal, and by now it
  // holds exactly one control, so its trap cycles on that one control forever.
  //
  // That is correct behaviour and it is asserted here rather than worked
  // around: a walk that never escapes is what a modal is *for*. The operator
  // then closes it, which is the only way out and the next thing a person does.
  const settledWalk = await tabThrough(operator, 12);
  const stops = new Set(settledWalk.map((stop) => `${String(stop.tag)}|${String(stop.name)}`));
  record('admin.settled_dialog_stops', [...stops].join(' , '));
  expect(
    settledWalk.every((stop) => stop.tag === 'button'),
    'the settled outcome dialog keeps the keyboard on its own control',
  ).toBe(true);

  const closeName = settledWalk[0]?.name ?? '';
  expect(closeName, 'the settled dialog offers a named way out').not.toBe('');
  await operator.keyboard.press('Enter');
  await expect(operator.getByTestId('verify-dialog')).toHaveCount(0, { timeout: 15_000 });
  record('admin.settled_dialog_closed_by', closeName);

  // Dispatch and completion, both through their confirmation dialogs and both
  // from the keyboard. The two are the fulfilment half of §5's Admin journey.
  for (const step of [
    {
      open: 'open-dispatch',
      confirm: 'dispatch-dialog-confirm',
      label: 'delivered',
      pill: S03_COPY.pillDelivered,
    },
    {
      open: 'open-completion',
      confirm: 'completion-dialog-confirm',
      label: 'completed',
      pill: S03_COPY.pillCompleted,
    },
  ]) {
    // The control's own accessible name is read first and then *walked to*, so
    // the step stays keyboard-driven without this spec hard-coding a copy string
    // that `V02` may legitimately reword.
    const openName = (await operator.getByTestId(step.open).innerText())
      .replace(/\s+/g, ' ')
      .trim();
    await tabUntil(
      operator,
      `the ${step.label} control`,
      (active) => active.tag === 'button' && active.name === openName,
      160,
    );
    await expectFocusIsDrawn(operator, `admin-${step.label}-open`);
    await operator.keyboard.press('Enter');

    const confirmation = operator.getByTestId(step.confirm);
    await expect(confirmation).toBeVisible();
    const inside = await operator.evaluate(
      () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
    );
    expect(inside, `focus enters the ${step.label} confirmation`).toBe(true);
    await expectNoSeriousViolations(operator, `admin-${step.label}-dialog`);

    const confirmName = (await confirmation.innerText()).replace(/\s+/g, ' ').trim();
    await tabUntil(
      operator,
      `the ${step.label} confirmation`,
      (active) => active.tag === 'button' && active.name === confirmName,
      20,
    );
    await operator.keyboard.press('Enter');
    await expect(confirmation).toHaveCount(0, { timeout: 30_000 });

    // The customer's screen after each fulfilment write (§6).
    await secureWatch?.audit(step.label, step.pill);
  }

  await expect(operator.getByTestId('order-detail-status')).toContainText(A02_COPY.completed, {
    timeout: 30_000,
  });
  expect(await evidence.orderStatusOf(placedCode as string)).toBe('COMPLETED');
  await expectNoSeriousViolations(operator, 'admin-order-completed');
  record('admin.journey_completed', true);
});
