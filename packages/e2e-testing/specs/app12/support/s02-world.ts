/**
 * The shared world of the `APP12-S02` acceptance run.
 *
 * Two spec files drive the same topology — the checkout journeys and the
 * `APP12-S02-C1` pre-hydration safety cases — and both need the same catalog
 * env, the same approved copy, the same real `APP4` verification lane and the
 * same commercial evidence reader. Keeping one copy of that here is what stops
 * the two files from drifting into two different ideas of what a verified
 * contact or a delivered link is; it also keeps each spec inside the 600-line
 * test limit (`CLAUDE.md` §6) without either of them being split by line count.
 *
 * Nothing secret crosses this boundary. `takeVerificationCode` returns a
 * plaintext code to be typed into a field and nothing else; the `ORDER_ACCESS`
 * token is never read here or anywhere in the suite.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

import { createS01Driver } from '../../app4/support/s01-verification-driver';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `APP5-E01`, this module treats those imports as `any` and lets each
   explicit `expect` in the specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-S02 acceptance run.`);
  }
  return value;
}

const PRODUCT = requiredEnv.bind(null, 'E2E_APP12_S02_PRODUCT_SLUG');
const MAIN_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_MAIN_SKU');
const SCARCE_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_SCARCE_SKU');
const AMBIGUOUS_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_AMBIGUOUS_SKU');

/** Approved `APP12-D01` copy, duplicated here as a test expectation on purpose. */
const COPY = {
  heading: 'Xác nhận đơn hàng',
  contactHeading: 'Liên hệ',
  verified: 'Đã xác minh',
  changeContact: 'Đổi liên hệ',
  deliveryHeading: 'Giao hàng',
  recipientName: 'Người nhận',
  recipientPhone: 'Số điện thoại người nhận',
  addressLine: 'Địa chỉ nhận hàng',
  province: 'Tỉnh/Thành',
  merchandise: 'Tiền hàng',
  shippingPending: 'Xưởng xác nhận sau',
  totalPending: 'Có sau khi xác nhận phí',
  submit: 'Đặt hàng',
  submitPending: 'Đang gửi…',
  successTitle: 'Đã tạo đơn hàng của bạn',
  orderCodeLabel: 'Mã đơn hàng',
  secureLink: 'Chúng tôi đã gửi liên kết theo dõi tới liên hệ bạn đã xác minh',
  invalidSelection: 'Chưa xác định được sản phẩm cần mua',
  back: 'Quay lại sản phẩm',
  outOfStock: 'Sản phẩm vừa hết hàng',
  nameRequired: 'Vui lòng nhập tên người nhận.',
  contactUnverified: 'Vui lòng xác minh liên hệ trước khi đặt hàng.',
} as const;

let runtime: any;
let worker: any;
let evidence: any;
let contactSeed = 0;

/** Safe facts only: booleans and counts. Never a code, a token or a contact. */
const proofs: Record<string, boolean | number | string> = {};

/** A checkout address, composed exactly as `APP12-S01`'s panel composes it. */
function checkoutUrl(skuId: string | undefined, quantity: string): string {
  const query = new URLSearchParams();
  if (skuId !== undefined) query.set('sku', skuId);
  query.set('quantity', quantity);
  return `/mua-hang/${PRODUCT()}?${query.toString()}`;
}

/**
 * Verify a contact through the **real** APP4 lane and leave the flow verified.
 *
 * A fresh synthetic address per call, so no two journeys share an idempotency
 * scope — two orders on one challenge is an `IDEMPOTENCY_CONFLICT` by design,
 * and a run that reused one would be measuring that instead of what it meant to.
 */
async function verifyContact(page: Page): Promise<string> {
  contactSeed += 1;
  const driver = createS01Driver(page);
  const address = `app12-s02-${String(contactSeed)}@vidu.test`;

  const url = page.url();
  const before = worker.deliveryCount();

  // Submitted **after hydration**, and the two are asserted together.
  //
  // `ContactEntryCard` is a real `<form>` whose `onSubmit` calls
  // `preventDefault`, and that handler does not exist until React has taken the
  // markup over. `APP12-S02-C1` makes that window *safe* — the band is a
  // disabled `<fieldset>` until the mount effect enables it, so a click or an
  // `Enter` in it now does nothing at all rather than performing a native GET
  // that destroyed the customer's `?sku=`. The dedicated pre-hydration cases
  // below prove exactly that.
  //
  // The retry here remains, and its meaning has changed: it is no longer
  // recovering from a destroyed URL, it is simply waiting for the control to
  // become operable. The URL check after it is the standing regression — if the
  // guard were ever removed, this is where the lost selection would surface.
  // The contact is re-entered inside the retry because a disabled field cannot
  // be filled, so the value may not have landed on the first attempt.
  await expect(async () => {
    if (new URL(page.url()).searchParams.get('sku') === null) await page.goto(url);
    await driver.chooseContactKind('EMAIL');
    await driver.enterContact('EMAIL', address);
    await driver.submitContact();
    await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });

  // The selection survived: whatever happened, the customer still has one.
  expect(new URL(page.url()).searchParams.get('sku')).not.toBeNull();

  // The API raises a notification intent; the **worker** is what turns it into a
  // delivery the recording adapter can be read from, and this topology holds the
  // worker's poll loop closed on purpose (`WORKER_STARTUP_GATE`) so a background
  // loop cannot race the assertions. So the run pumps it explicitly, exactly as
  // `APP5-E01` does.
  await runWorkerUntilIdle();

  // The code exists only in this process's memory and in the field below.
  const code = takeVerificationCode(before);
  await driver.enterCode(code);
  await driver.submitCode();

  await expect(page.getByText(COPY.verified)).toBeVisible();

  // Returned so a consumer that must re-verify the **same** contact can do so.
  // `APP12-S03`'s step-up re-verifies the customer who placed the order, not a
  // new one, and a different address would prove nothing: the server would
  // still refuse the initiation it was meant to authorize. Synthetic
  // `@vidu.test`, never logged.
  return address;
}

/**
 * The verification code from the deliveries this journey produced.
 *
 * **Searched by kind, never taken positionally.** Once a journey has created an
 * order, the queue also carries that order's `SECURE_LINK_TOKEN` delivery, and a
 * later journey that drains the worker picks it up first — so "the delivery at
 * index `from`" is the code only for the very first journey of a run. Asking for
 * the first `VERIFICATION_CODE` at or after `from` is what the caller actually
 * means, and it is order-independent.
 *
 * The plaintext is returned to be typed into a field and nowhere else: it is not
 * logged, not attached, and not compared with an operand-printing matcher.
 */
function takeVerificationCode(from: number): string {
  const end = worker.deliveryCount() as number;
  // Newest first. A retried submit issues a *replacement* challenge, and
  // `APP4`'s reducer says the replacement's identity wholly replaces the old
  // one — so the code the card is now answering is the latest one, and taking
  // the oldest would answer a challenge the server has already cancelled.
  for (let index = end - 1; index >= from; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      return worker.secretOf(index) as string;
    }
  }
  throw new Error(
    `No VERIFICATION_CODE delivery was recorded at or after index ${String(from)} ` +
      `(${String(end - from)} delivery/deliveries seen).`,
  );
}

/** How many secure-link deliveries the run has produced, by kind and never by value. */
function secureLinkDeliveryCount(): number {
  const end = worker.deliveryCount() as number;
  let seen = 0;
  for (let index = 0; index < end; index += 1) {
    if (worker.safeDelivery(index).secretKind === 'SECURE_LINK_TOKEN') seen += 1;
  }
  return seen;
}

/**
 * Drains the worker's due jobs, one real attempt at a time.
 *
 * The guard is a bound, not a timeout: a run that still has due jobs after this
 * many attempts has a loop, and failing loudly is better than spinning.
 */
async function runWorkerUntilIdle(guard = 12): Promise<number> {
  let executed = 0;
  for (let attempt = 0; attempt < guard; attempt += 1) {
    const summary = await worker.runOnce();
    if (summary === undefined) return executed;
    executed += 1;
  }
  throw new Error(`Worker still had due jobs after ${String(guard)} attempts.`);
}

// `exact` on every lookup: `Người nhận` is a substring of
// `Số điện thoại người nhận`, so a loose label match resolves to two inputs and
// Playwright's strict mode refuses it. The same trap the APP4 driver records
// for its own contact field.
async function fillDelivery(page: Page, address = '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1') {
  await page.getByLabel(COPY.recipientName, { exact: true }).fill('Nguyễn Minh Anh');
  await page.getByLabel(COPY.recipientPhone, { exact: true }).fill('0901234567');
  await page.getByLabel(COPY.addressLine, { exact: true }).fill(address);
  await page.getByLabel(COPY.province, { exact: true }).fill('TP. Hồ Chí Minh');
}
/**
 * Issues and verifies one challenge through the real public endpoints.
 *
 * Used only by the API-level idempotency proof, which needs a challenge it can
 * name — the browser journey deliberately gives it none, because the id never
 * reaches the URL, storage or the DOM.
 */
async function issueAndVerifyChallenge(request: any): Promise<string> {
  contactSeed += 1;
  const before = worker.deliveryCount();
  const issued = await request.post('/api/public/verification/challenges', {
    data: {
      contactKind: 'EMAIL',
      contact: `app12-s02-api-${String(contactSeed)}@vidu.test`,
      purpose: 'SUBMISSION',
    },
  });
  // `202`, not `201`: issuing a challenge *accepts* the request and hands the
  // delivery to the notification path, which is a different claim from "a
  // resource was created at a location". Asserted as `ok()` so this proof is
  // about idempotency rather than about pinning APP4's success code.
  expect(issued.ok(), `challenge issue answered ${String(issued.status())}`).toBe(true);
  const challengeId = (await issued.json()).data.challengeId;

  // Same reason as the browser path: the delivery only exists once the worker
  // has actually run the job, and it is found by kind rather than by position.
  await runWorkerUntilIdle();
  const code = takeVerificationCode(before);
  const attempt = await request.post(
    `/api/public/verification/challenges/${String(challengeId)}/attempts`,
    { data: { code } },
  );
  expect(attempt.ok()).toBe(true);
  return challengeId as string;
}

export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/**
 * Boots the run's universe and hands back the readers the specs use.
 *
 * Called from each spec's `beforeAll`. The two files run sequentially in one
 * worker, so each owns its contexts for the length of its own file and closes
 * them in `afterAll` — there is never more than one live at a time.
 */
export async function openS02World(): Promise<void> {
  const databaseUrl = requiredEnv('E2E_DATABASE_URL');
  const { createApp4E01Runtime } = await import('../../../support/app4/app4-runtime.mjs');
  const { createWorkerControl } = (await import('../../../support/app4/worker-control.mjs')) as any;
  const { createS02Evidence } =
    (await import('../../../support/app12/s02-checkout-fixture.mjs')) as any;

  runtime = await createApp4E01Runtime({
    runId: requiredEnv('E2E_RUN_ID'),
    app4: {
      verificationCodePepper: requiredEnv('VERIFICATION_CODE_SECRET_PEPPER'),
      secureLinkTokenPepper: requiredEnv('SECURE_LINK_TOKEN_SECRET_PEPPER'),
      notificationDeliveryEnvelopeKey: requiredEnv('NOTIFICATION_DELIVERY_ENVELOPE_KEY'),
      storefrontOrigin: requiredEnv('STOREFRONT_PUBLIC_ORIGIN'),
      designSessionPepper: requiredEnv('DESIGN_SESSION_SECRET_PEPPER'),
    },
    databaseUrl,
  });
  worker = createWorkerControl(runtime);
  evidence = await createS02Evidence(databaseUrl);
}

/** Closes the universe and prints the run's safe proofs. */
export async function closeS02World(label: string): Promise<void> {
  await evidence?.close?.();
  await runtime?.close?.();
  runtime = undefined;
  worker = undefined;
  evidence = undefined;
  process.stdout.write(`${label} ${JSON.stringify(proofs)}\n`);
}

/** The commercial evidence reader. Counts and safe columns only. */
export function s02Evidence(): any {
  return evidence;
}

/**
 * The run's worker control, for a consumer that needs the delivery it produced.
 *
 * `APP12-S03` opens the secure order surface from the **real** `ORDER_ACCESS`
 * link this worker delivered, so it needs the recording adapter this module
 * already owns rather than a second runtime beside it — two worker contexts on
 * one database would claim each other's jobs and neither suite could say which
 * one ran.
 *
 * It is an accessor and not the secret: the caller still has to ask the control
 * for `secureLinkOf`, whose contract is in-memory navigation and nothing else.
 */
export function s02Worker(): any {
  return worker;
}

/**
 * The run's in-process worker runtime, for a consumer that needs a capability
 * the **job queue** cannot reach.
 *
 * `s02Worker().runOnce()` claims from the queue, which is the whole worker for
 * event-driven jobs. The Ready-Made reservation-expiry sweep is not one: it is a
 * sequential runtime loop (`ReservationExpiryRuntimeService`), so no job is ever
 * enqueued for it and no amount of draining will run it. `APP12-S03`'s expiry
 * journey therefore resolves the real `ExpireReadyMadeReservationsUseCase` out
 * of this context and calls it — the same class, the same repositories and the
 * same transaction the loop uses, differing only in who decides *when*.
 */
export function s02Runtime(): any {
  return runtime;
}

export {
  AMBIGUOUS_SKU,
  COPY,
  MAIN_SKU,
  PRODUCT,
  SCARCE_SKU,
  checkoutUrl,
  fillDelivery,
  issueAndVerifyChallenge,
  proofs,
  requiredEnv,
  runWorkerUntilIdle,
  secureLinkDeliveryCount,
  verifyContact,
};
