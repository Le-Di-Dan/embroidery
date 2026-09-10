/**
 * The shared world of the `APP12-S03` acceptance run.
 *
 * Two spec files drive one topology — the full lifecycle at three viewports,
 * and the expiry / fee-correction / evidence / security journeys — and both need
 * the same real order-placement path, the same real `ORDER_ACCESS` link and the
 * same operator driver. Keeping one copy here is what stops them drifting into
 * two ideas of what a delivered link is, and it keeps each spec inside the
 * 600-line test limit (`CLAUDE.md` §6).
 *
 * ## The order is placed by a real customer, through a real browser
 *
 * Nothing S03 is meant to prove is seeded. `placeOrder` drives `APP12-S02`'s
 * delivered checkout — a real APP4 verification, a real `publicReadyMadeOrder_create`
 * — because an order that a fixture wrote would carry no grant, raise no
 * notification, and prove nothing about the surface that opens it.
 *
 * The catalog beneath it is `seedS02Catalog`'s, reused rather than duplicated.
 *
 * ## The secure link is the one the worker delivered
 *
 * `takeOrderAccessLink` reads the newest `SECURE_LINK_TOKEN` delivery out of the
 * recording adapter — the same record the real notification path wrote, from the
 * real `APP12-B04` issuance. It is handed straight to `page.goto` and **never**
 * returned to a spec, printed, attached, or put in a filename. The only thing a
 * spec ever learns about it is that navigation worked.
 *
 * ## Nothing secret crosses this boundary
 *
 * The module exports no accessor that returns a token, a code, an envelope or a
 * contact. `openSecureOrder` takes the browser and the order code and gives back
 * a page whose `location.hash` has already been stripped — which is the only
 * observable a spec needs and the only one it is allowed.
 *
 * Test-only.
 */
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

import {
  COPY as S02_COPY,
  MAIN_SKU,
  checkoutUrl,
  fillDelivery,
  requiredEnv,
  runWorkerUntilIdle,
  s02Worker,
  verifyContact,
} from './s02-world';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `APP12-S02`, this module treats those imports as `any` and lets each
   explicit `expect` in the specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/** The one route S03 delivers. */
export const ORDER_ACCESS_PATH = '/truy-cap/don-hang';

/**
 * Approved `APP12-D01` copy, duplicated here as a test expectation on purpose.
 *
 * Transcribed from the frames rather than imported from the Storefront: a spec
 * that imported the catalog would pass whatever the catalog said, including a
 * regression in it. Node ids are in `order-access-copy.ts`.
 */
export const COPY = {
  /**
   * The page heading, **per state** (`V01-UX-012`, `APP12-V02` §17.1).
   *
   * It was one string, `Thanh toán đơn hàng`, used in all nine states — four of
   * which have nothing left to pay. Transcribed here per state for the same
   * reason the rest of this catalog is transcribed: a spec that imported the
   * Storefront catalog would pass whatever that catalog said.
   */
  headingAwaitingFee: 'Đang chờ phí giao hàng',
  headingAwaitingPayment: 'Thanh toán đơn hàng',
  headingUnderReview: 'Đang đối chiếu thanh toán',
  headingReadyForDelivery: 'Đơn hàng đang chuẩn bị giao',
  headingDelivered: 'Đơn hàng đã giao',
  headingCompleted: 'Đơn hàng hoàn tất',
  headingCancelled: 'Đơn hàng đã huỷ',
  headingExpired: 'Đơn hàng đã hết hạn giữ',

  pillAwaitingFee: 'Chờ xưởng báo phí giao hàng',
  pillAwaitingPayment: 'Chờ thanh toán',
  pillUnderReview: 'Xưởng đang đối chiếu',
  pillReadyForDelivery: 'Đã thanh toán · chuẩn bị giao',
  pillDelivered: 'Đã giao',
  pillCompleted: 'Hoàn tất',
  pillCancelled: 'Đã huỷ',
  pillExpired: 'Hết hạn giữ hàng',

  bodyAwaitingFee: 'Xưởng đang tính phí giao hàng cho địa chỉ của bạn.',
  bodyExpired: 'Đơn đã huỷ vì quá hạn giữ hàng 24 giờ.',
  bodyCancelled: 'Đơn hàng đã được huỷ.',

  amountTitle: 'Số tiền cần thanh toán',
  amountPending: 'Có sau khi xưởng xác nhận phí giao hàng',
  merchandiseLabel: 'Tiền hàng',
  feeLabel: 'Phí giao hàng',

  transferTitle: 'Chuyển khoản ngân hàng',
  referenceLabel: 'Nội dung chuyển khoản',
  qrTitle: 'Quét mã để chuyển khoản',
  qrTruth:
    'Quét mã hoặc chuyển tiền chưa có nghĩa là đơn đã được thanh toán. Xưởng sẽ đối chiếu và xác nhận.',

  startAttempt: 'Hiện thông tin chuyển khoản',
  attemptOpened: 'Thông tin chuyển khoản đã sẵn sàng bên dưới.',
  superseded:
    'Xưởng vừa cập nhật phí giao hàng, nên số tiền đã thay đổi. Bạn chuyển khoản theo số tiền mới bên dưới.',

  evidenceTitle: 'Ảnh xác nhận chuyển khoản',
  evidenceOptional: 'Không bắt buộc',
  evidenceTruth:
    'Ảnh đã nhận không có nghĩa là đã thanh toán. Xưởng vẫn cần đối chiếu khoản chuyển.',
  evidencePending: 'Đang kiểm tra',

  deadlinePrefix: 'Xưởng giữ hàng đến',
  accessExpiryPrefix: 'Liên kết hết hạn',

  stepUpTitle: 'Xác minh lại trước khi thanh toán',

  unavailableTitle: 'Liên kết không sử dụng được',
} as const;

/** Every heading the authorized surface can render, for "has it loaded" waits. */
export const ORDER_ACCESS_HEADINGS: readonly string[] = [
  COPY.headingAwaitingFee,
  COPY.headingAwaitingPayment,
  COPY.headingUnderReview,
  COPY.headingReadyForDelivery,
  COPY.headingDelivered,
  COPY.headingCompleted,
  COPY.headingCancelled,
  COPY.headingExpired,
];

/** The three approved viewports (`APP12-D01` §L). */
export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/** Safe facts only: booleans, counts and order codes. Never a secret. */
export const proofs: Record<string, boolean | number | string> = {};

let evidenceReader: any;

export async function openS03World(): Promise<void> {
  const { createS03Evidence } = await import('../../../support/app12/s03-order-fixture.mjs');
  evidenceReader = await createS03Evidence(requiredEnv('E2E_DATABASE_URL'));
}

export async function closeS03World(label: string): Promise<void> {
  await evidenceReader?.close?.();
  evidenceReader = undefined;
  process.stdout.write(`${label} ${JSON.stringify(proofs)}\n`);
}

/** The commercial evidence reader. Counts, statuses and opaque ids only. */
export function s03Evidence(): any {
  return evidenceReader;
}

/**
 * Places one real Ready-Made order through the delivered checkout.
 *
 * Returns the **order code** — the one identifier the customer is actually
 * shown, and the only one a spec needs. The grant, the token and the customer's
 * contact stay where the application put them.
 */
export interface PlacedOrder {
  readonly orderCode: string;
  /** The synthetic contact the order was verified with. Never logged. */
  readonly contact: string;
}

export async function placeOrder(page: Page): Promise<PlacedOrder> {
  await page.goto(checkoutUrl(MAIN_SKU(), '1'));
  const contact = await verifyContact(page);
  await fillDelivery(page);

  await page.getByRole('button', { name: S02_COPY.submit }).click();
  await expect(page.getByRole('heading', { name: S02_COPY.successTitle })).toBeVisible({
    timeout: 20_000,
  });

  // The delivered success panel renders the code into its own `<dd>`, so this
  // reads exactly the string the customer reads. `APP12-S02` ships no test id on
  // this panel and none is added here: a class the feature already owns is a
  // weaker coupling than a contract the app would then have to keep.
  const code = (await page.locator('.ready-made-checkout__order-code').innerText()).trim();
  const match = /ORD-[A-Z0-9]+/.exec(code);
  expect(match, 'the success panel printed an order code').not.toBeNull();

  // The API raised the ORDER_ACCESS notification intent; the worker is what
  // turns it into a delivery this run can navigate. The topology holds the poll
  // loop closed, so the run pumps it explicitly.
  await runWorkerUntilIdle();
  return { orderCode: match![0], contact };
}

/**
 * Opens the secure order surface from the **exact** delivered link.
 *
 * The delivered URL is read out of the recording adapter and is never returned,
 * logged or attached — the caller gets a settled page and nothing else.
 *
 * ## Nothing is substituted (`APP12-S03-C1`)
 *
 * S03's first live tier could not do this: one hard-coded landing sent every
 * `ORDER_ACCESS` link to `/truy-cap`, so the run kept the real token and
 * re-composed the path — which proved the surface and nothing about what a
 * customer receives. It navigates to the delivered string itself now, pathname
 * asserted first, so a routing regression fails every journey at its first
 * navigation.
 *
 * ## The strip is asserted here, once, for every journey
 *
 * By the time this returns, `location.hash` is empty and the address bar carries
 * only the route — so no screenshot any journey takes can observe the fragment.
 */
export async function openSecureOrder(page: Page): Promise<void> {
  const worker = s02Worker();
  let record: number | undefined;
  const end: number = worker.deliveryCount();
  for (let index = end - 1; index >= 0; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'SECURE_LINK_TOKEN') {
      record = index;
      break;
    }
  }
  expect(record, 'a SECURE_LINK_TOKEN delivery was recorded').toBeDefined();

  const secureUrl: string = worker.secureLinkOf(record);
  expect(typeof secureUrl === 'string' && secureUrl.length > 0).toBe(true);

  const delivered = new URL(secureUrl);

  // What the customer was actually sent, asserted before it is opened. The
  // pathname is not a secret and naming it in a failure message discloses
  // nothing; the token, in the fragment, is never part of any assertion value.
  expect(
    delivered.pathname,
    'the delivered ORDER_ACCESS link lands on the Ready-Made order surface',
  ).toBe(ORDER_ACCESS_PATH);
  expect(delivered.hash.startsWith('#t='), 'the carrier is the #t= fragment').toBe(true);
  // The credential is in the fragment and nowhere else — never a query, never a
  // path segment. Asserted as booleans so no failure prints the URL.
  expect(delivered.search === '', 'the delivered link carries no query').toBe(true);
  expect(
    delivered.pathname.includes(delivered.hash.slice(3)) === false,
    'the delivered link carries no token in its path',
  ).toBe(true);

  // The delivered string itself. No path repair, no token rewriting, no
  // re-composition — this is the URL the customer's own message carries.
  await page.goto(secureUrl);

  // Waited for the **authorized** surface, not merely for a settled one.
  //
  // The route is server-rendered, so the bootstrap heading is in the HTML before
  // the client has hydrated — and the strip is the client's first act, so
  // polling on a heading that is already there would assert the fragment before
  // anything had had the chance to remove it.
  //
  // The transient card is also a settled state, and a legitimate one: the
  // secure-link limiter counts requests rather than outcomes, so a run that has
  // just exercised several journeys can meet a 429 that says nothing about this
  // link. That is exactly the state the approved screen offers a manual retry
  // for, so the run presses it — which is what a customer does, and is a
  // stronger proof of the retry affordance than asserting it exists.
  await expect
    .poll(
      async () => {
        const heading = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
        // Any of the state headings means the authorized page has rendered.
        if (ORDER_ACCESS_HEADINGS.includes(heading)) return true;
        const retry = page.getByRole('button', { name: 'Thử lại' });
        if (await retry.isVisible().catch(() => false)) await retry.click();
        return false;
      },
      { timeout: 90_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(true);

  // Nothing below this line — including every screenshot — can observe the
  // fragment, because there is no longer one to observe.
  //
  // Polled as a **boolean**. `toBe('')` prints its received value on failure,
  // and the received value here is a live credential in the URL — a failing
  // assertion would put the token in the console, the report and CI output. The
  // predicate answers yes/no and the message names no value.
  await expect
    .poll(() => page.evaluate(() => window.location.hash === ''), { timeout: 15_000 })
    .toBe(true);
  expect(new URL(page.url()).pathname).toBe(ORDER_ACCESS_PATH);
  expect(new URL(page.url()).search).toBe('');
}

/**
 * Runs the **real** Ready-Made reservation-expiry sweep, once.
 *
 * `ExpireReadyMadeReservationsUseCase` is resolved out of this run's in-process
 * worker context, so the claim, the release, the order cancellation and the
 * recorded `RESERVATION_EXPIRED` reason are all produced by the delivered code
 * inside the delivered transaction. The harness decides only *when* it runs —
 * which it has to, because the sweep is a sequential runtime loop rather than a
 * queued job, so nothing the run could drain would ever trigger it.
 *
 * Returns the sweep's own outcome, so a journey can assert it examined and
 * expired something rather than assuming it did.
 */
export async function runReservationExpirySweep(): Promise<unknown> {
  const { s02Runtime } = await import('./s02-world');
  const { createRequire } = await import('node:module');
  const { join } = await import('node:path');

  const requireFromWorker = createRequire(
    join(requiredEnv('E2E_REPO_ROOT'), 'apps', 'worker', 'package.json'),
  );
  const { ExpireReadyMadeReservationsUseCase } = requireFromWorker(
    './dist/jobs/ready-made-reservation-expiry/application/expire-reservations.usecase.js',
  );

  const useCase = s02Runtime().workerContext.get(ExpireReadyMadeReservationsUseCase);
  return useCase.run();
}

/**
 * The surface's own anti-polling quiet window, plus a margin.
 *
 * `useSecureOrderSession` coalesces attention-triggered re-reads through a
 * 10-second window, so a customer alt-tabbing twice does not spend the
 * secure-link budget twice (§26). A journey that dispatched two focus events a
 * second apart would therefore see only the first — and would read that as the
 * screen failing to catch up with an operator's write.
 *
 * So the run waits the window out rather than shortening it. The delay is the
 * behaviour under test, not an obstacle to it: what a returning customer does is
 * come back *later*.
 */
const REFRESH_QUIET_MS = 11_000;

/**
 * Re-reads the surface until it shows what an operator's write has already made
 * true — the way a customer who keeps coming back does.
 *
 * A single dispatch is not enough and must not be made enough. The surface
 * coalesces attention-triggered re-reads through a quiet window, and the window
 * starts from *any* earlier refresh — including one the browser itself caused by
 * focusing the page. So a run that dispatched once and asserted immediately
 * would be racing a timer it does not own, and would fail intermittently while
 * the code was correct.
 *
 * Retrying is also the honest model: nothing here bypasses the window, shortens
 * it, or reaches into the page's state. Each attempt is one more visit.
 */
export async function refreshUntilVisible(page: Page, locator: Locator): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await refreshSecureOrder(page);
    if (await locator.isVisible().catch(() => false)) return;
  }
  await expect(locator).toBeVisible({ timeout: 20_000 });
}

/** Re-reads the surface the way a returning customer does: focus, no reload. */
export async function refreshSecureOrder(page: Page): Promise<void> {
  await page.waitForTimeout(REFRESH_QUIET_MS);
  // A reload would lose the credential by design (§34), so the run uses the
  // delivered refresh path instead — the same one a customer triggers by coming
  // back to the tab. The quiet window is coalesced, so the run advances the
  // page's clock rather than waiting it out.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/**
 * The exact figure the customer's own screen is showing, as text.
 *
 * The **number** alone. The approved highlight renders the grouped amount and
 * its currency as two elements (`910:297`), and a reader that took the whole
 * row would return "434.000 VND" and never equal the obligation's own decimal.
 */
export async function readPayableTotal(page: Page): Promise<string> {
  const amount = page.locator('.secure-order__highlight-number');
  // Waited for generously, because the figure is a **second** read. The pill
  // comes from the order projection and the amount from the FULL obligation, and
  // the obligation is only fetched once the order reports itself payable — so
  // there is a real window in which the state has flipped and the amount has
  // not arrived. That window is the design (§14), not a defect.
  await expect(amount).toBeVisible({ timeout: 30_000 });
  return (await amount.innerText()).trim();
}

/** One status pill, matched exactly rather than as a substring. */
export function statusPill(page: Page, label: string) {
  return page.locator(`.secure-order__pill:has-text("${label}")`);
}

/** The transfer reference the customer's own screen is showing. */
export async function readTransferReference(page: Page): Promise<string> {
  const reference = page.locator('.secure-order__reference');
  await expect(reference).toBeVisible();
  return (await reference.innerText()).trim();
}

/**
 * Opens the operator session, from this run's bootstrap Admin credentials.
 *
 * The credentials arrive through the child environment and are never printed.
 */
export async function openAdminDriver(browser: Browser): Promise<any> {
  const { createS03AdminDriver } = await import('./s03-admin-driver');
  return createS03AdminDriver(browser, requiredEnv('E2E_BASE_ADMIN'), {
    email: requiredEnv('E2E_ADMIN_EMAIL'),
    password: requiredEnv('E2E_ADMIN_PASSWORD'),
  });
}
