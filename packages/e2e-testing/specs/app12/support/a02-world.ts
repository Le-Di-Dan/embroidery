/**
 * The `APP12-A02-C1` world: a real operator, on the real Admin, working real
 * Ready-Made orders.
 *
 * ## What this borrows, and why borrowing is right
 *
 * The topology is `APP12-S03`'s exactly — a disposable database, the real API,
 * the real worker, the real Storefront, the real Admin, this run's object
 * storage — because the two checkpoints need the *same* commercial universe and
 * differ only in which screen is under test. So `placeOrder` and the evidence
 * reader are imported from the S03 world rather than rewritten: an order this
 * suite works on is one the delivered customer checkout actually created, which
 * is the only way an Admin screen can be proved against real frozen facts.
 *
 * ## What it adds
 *
 * An **operator** context on the Admin origin, and helpers that drive the
 * delivered Admin *screen* rather than the Admin API. That is the difference
 * that matters: `s03-admin-driver.ts` calls the operations directly, because
 * S03's subject was what the customer then sees. Here the subject is the
 * operator's own screen, so every write below goes through a control a person
 * can actually click.
 *
 * ## Nothing secret is read, logged or returned
 *
 * No token, digest, password or contact value crosses this module's boundary.
 * The operator's password is read from the child environment and typed into the
 * real form; it is never returned, never asserted on and never printed.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so the worker control arrives untyped. As in
   `s02-world.ts`, this module treats those imports as `any` and lets each
   explicit `expect` be the contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/** The Admin login form's stable ids and its one approved control. */
const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  logoutName: 'Đăng xuất',
} as const;

/** The delivered Admin routes this checkpoint extends. It creates none. */
export const ORDERS_PATH = '/orders';
export const orderDetailPath = (orderId: string): string => `/orders/${orderId}`;

/**
 * The approved copy the journeys assert on (`912:337`, `913:337`, `914:361`).
 *
 * Asserted as the **operator's own words** rather than as test ids wherever the
 * design draws a sentence: a test id proves an element exists, and these
 * journeys are about what an operator is told.
 */
export const COPY = {
  queueTitle: 'Đơn hàng',
  originLegend: 'Nguồn đơn',
  originColumn: 'Nguồn',
  readyMadeBadge: 'Bán sẵn',
  customBadge: 'Thêu riêng',
  awaitingFee: 'Chờ báo phí',
  awaitingPayment: 'Chờ thanh toán',
  readyForDelivery: 'Sẵn sàng giao',
  delivered: 'Đã giao',
  completed: 'Hoàn tất',
  shippingHeading: 'Phí giao hàng',
  confirmFee: 'Xác nhận phí và mở thanh toán',
  correctFee: 'Cập nhật phí',
  refusedTitle: 'Không thể sửa phí',
  paymentHeading: 'Thanh toán',
  // `APP12-V02` §24: the Ready-Made workbench branches its payment vocabulary
  // on the order origin, and this is the READY_MADE branch's submit control. A
  // deposit on a custom order still reads “Xác nhận đã nhận tiền cọc”.
  verify: 'Xác nhận đã nhận thanh toán',
  omitted: 'Không hiển thị',
} as const;

/** The two viewports `APP12-D01` §L draws the Admin at. No 390 is invented. */
export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 800 },
] as const;

/** Safe facts only: booleans, counts and order codes. Never a secret. */
export const proofs: Record<string, boolean | number | string> = {};

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-A02 journeys.`);
  }
  return value;
}

/**
 * The Storefront origin the customer half of a journey runs on.
 *
 * The project's own `baseURL` is the **Admin**, because that is the screen
 * under test; a customer context has to be told where the shop is. Read through
 * the same required-env guard rather than defaulted, so a missing variable
 * fails at the first navigation with the variable's name instead of producing
 * a relative URL nobody can diagnose.
 */
export function storefrontOrigin(): string {
  return requiredEnv('E2E_BASE_STOREFRONT');
}

/**
 * Opens an authenticated operator session on the Admin origin.
 *
 * Its own context, closed by the caller. The customer's browser context is
 * never reused: the two actors in these journeys are two real sessions, which
 * is the only honest way to prove an operator's screen against an order a
 * customer created.
 */
export async function openOperator(browser: Browser): Promise<{
  readonly context: BrowserContext;
  readonly page: Page;
}> {
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_ADMIN'),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto('/login');
  // Filled under `toPass`, because the inputs are React-controlled and a fill
  // that lands before hydration is overwritten when the client takes over the
  // DOM — the submit then carries empty credentials and the run fails on a
  // missing logout button with both fields blank. Asserting the values stuck
  // is what makes the submit below meaningful.
  await expect(async () => {
    await page.locator(LOGIN.emailInput).fill(requiredEnv('E2E_ADMIN_EMAIL'));
    await page.locator(LOGIN.passwordInput).fill(requiredEnv('E2E_ADMIN_PASSWORD'));
    await expect(page.locator(LOGIN.emailInput)).not.toHaveValue('');
    await expect(page.locator(LOGIN.passwordInput)).not.toHaveValue('');
  }).toPass({ timeout: 30_000 });

  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: LOGIN.logoutName })).toBeVisible();

  return { context, page };
}

/** One queue row, addressed by the order code an operator actually scans by. */
export function queueRow(page: Page, orderCode: string) {
  return page.getByTestId('order-queue-row').filter({ hasText: orderCode });
}

/** Opens the queue and waits for the table rather than for a timeout. */
export async function openQueue(page: Page): Promise<void> {
  await page.goto(ORDERS_PATH);
  await expect(page.getByTestId('order-queue-table')).toBeVisible();
}

/**
 * Opens one order's detail from the queue, by clicking its code.
 *
 * Navigating through the list rather than to a composed URL is deliberate: it
 * proves the queue's own link, and it is what an operator does.
 */
export async function openOrderFromQueue(page: Page, orderCode: string): Promise<void> {
  await openQueue(page);
  await queueRow(page, orderCode)
    .getByRole('link', { name: new RegExp(orderCode) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: orderCode })).toBeVisible();
}

/**
 * Sets or corrects the shipping fee through the delivered card.
 *
 * The fee is typed as text and submitted by clicking the card's own button —
 * no API call, no form submission the screen does not offer. The wait is on the
 * screen settling rather than on a timeout.
 */
export async function submitShippingFee(page: Page, feeAmount: string): Promise<void> {
  const submit = page.getByTestId('shipping-fee-submit');
  await page.getByTestId('shipping-fee-input').fill(feeAmount);

  // The one signal that means "the server answered": the button is disabled
  // for the whole flight, so it being enabled again is the mutation settling.
  //
  // Waiting on the input's value instead would prove nothing at all — it holds
  // the typed string from the moment `fill` returns, so the assertion would
  // pass before the request was even sent. That is the trap this comment
  // exists to keep shut.
  await submit.click();
  await expect(submit).toBeEnabled({ timeout: 30_000 });

  // A refusal is a legitimate outcome of this control, so it is reported here
  // rather than left for the caller to discover as a confusing later mismatch.
  const failure = page.getByTestId('shipping-fee-error');
  if ((await failure.count()) > 0) {
    throw new Error(`the shipping fee save was refused: ${await failure.innerText()}`);
  }
}

/**
 * Opens one real `FULL` payment attempt, as the customer.
 *
 * The operator's screen cannot be proved against an attempt the harness
 * invented: `adminPaymentAttempt_verify` is addressed by an `attemptId`, and
 * the whole point of this correction is that the Admin read now publishes the
 * one a **customer** created. So the customer presses the delivered control,
 * clears the step-up if the server asks for one, and leaves an attempt open.
 *
 * It mirrors the private `openAttempt` helper in
 * `s03-journeys.acceptance.spec.ts`. The duplication is deliberate rather than
 * lazy: that helper lives inside a **delivered acceptance spec**, and lifting
 * it into shared support would edit a suite this correction has no business
 * touching. Recorded as `FU-APP12-A02-C1-01`.
 */
export async function openFullPaymentAttempt(page: Page, contact: string): Promise<void> {
  const { createS01Driver } = await import('../../app4/support/s01-verification-driver');
  const { s02Worker, runWorkerUntilIdle } = await import('./s02-world');
  const worker = s02Worker();
  const driver = createS01Driver(page);
  const before = worker.deliveryCount() as number;

  await page.getByRole('button', { name: 'Hiện thông tin chuyển khoản' }).click();

  // The step-up is conditional on GRD-003 freshness, so the run follows
  // whichever branch the server chose rather than assuming one.
  const stepUp = page.getByRole('heading', { name: 'Xác minh lại trước khi thanh toán' });
  const evidenceSection = page.getByRole('heading', { name: 'Ảnh xác nhận chuyển khoản' });
  await expect
    .poll(async () => (await stepUp.count()) > 0 || (await evidenceSection.count()) > 0, {
      timeout: 30_000,
    })
    .toBe(true);
  if ((await stepUp.count()) === 0) {
    await expect(evidenceSection).toBeVisible();
    return;
  }

  await driver.chooseContactKind('EMAIL');
  await driver.enterContact('EMAIL', contact);
  await driver.submitContact();
  await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
    timeout: 20_000,
  });

  await runWorkerUntilIdle();

  let code: string | undefined;
  for (let index = (worker.deliveryCount() as number) - 1; index >= before; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      code = worker.secretOf(index) as string;
      break;
    }
  }
  expect(code, 'a step-up VERIFICATION_CODE was delivered').toBeDefined();

  await driver.enterCode(code as string);
  await driver.submitCode();
  // The **evidence** section, not the transfer card: the transfer card is
  // mounted from `payable` and is on screen before any attempt exists, so
  // waiting for it would let a failed step-up pass for a successful one.
  await expect(evidenceSection).toBeVisible({ timeout: 30_000 });
}

/** The order's LC-14 badge on its detail header, as an operator reads it. */
export function detailStatus(page: Page) {
  return page.getByTestId('order-detail-status');
}

/** The origin badge on the detail header. */
export function detailOrigin(page: Page) {
  return page.getByTestId('order-detail-origin-pill');
}
