/**
 * The `APP12-E01` Wave-1 regression world — the commerce topology composed over
 * a **real SMTP boundary**.
 *
 * ## Why E01 owns a world rather than reusing S02's
 *
 * `APP12-S02`/`S03` compose the worker with the recording adapter: the
 * verification code and the `ORDER_ACCESS` link are read out of an array in this
 * process. That is what those checkpoints needed and it proved what it claimed.
 * It cannot prove either of the two things `APP12-E01` is accountable for:
 *
 * - §3.1 / `FU-APP12-H07-05` — that *this* run's worker resolves
 *   `SmtpNotificationChannelAdapter` for EMAIL. An environment variable is not
 *   evidence; `APP12-N01.S01` learned that the hard way, twice, against a stale
 *   `dist`. So the adapter is read out of the composed DI graph.
 * - §3.7 / `FU-APP12-H02-01` — that the `ORDER_ACCESS` link a *delivered message*
 *   carries is addressed at the configured `STOREFRONT_PUBLIC_ORIGIN`, that the
 *   email boundary accepts it, and that opening it reaches the intended
 *   Storefront host. A link read from the adapter that composed it can only ever
 *   agree with itself.
 *
 * So this world starts the capture listener first, hands its address to the
 * worker, and every secret this run uses comes off the wire.
 *
 * ## Reused, deliberately not re-implemented
 *
 * The catalog, the delivery form, the approved copy and the verification driver
 * are `APP12-S01`/`S02`/`APP4`'s. Only the composition is new. What is *not*
 * reused is `s02-world`'s own `openS02World` — two worker contexts on one
 * database would claim each other's jobs and neither suite could say which one
 * ran.
 *
 * ## Nothing secret crosses this boundary
 *
 * No export returns a code, a token or a link. The verification code is read
 * inside {@link verifyThroughDeliveredEmail} and typed straight into the field;
 * the secure link is read inside {@link openDeliveredOrderAccess} and handed
 * straight to `page.goto`. What a spec learns is booleans, counts, origins and
 * order codes.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

import { createS01Driver } from '../../app4/support/s01-verification-driver';
import { COPY as S02_COPY, MAIN_SKU, fillDelivery, requiredEnv } from './s02-world';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `APP12-S02` and `S03`, this module treats those imports as `any` and lets
   each explicit `expect` in the specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/** The route the delivered `ORDER_ACCESS` link must land on. */
export const ORDER_ACCESS_PATH = '/truy-cap/don-hang';

/** Safe facts only: booleans, counts, origins and order codes. Never a secret. */
export const proofs: Record<string, boolean | number | string> = {};

let smtp: any;
let runtime: any;
let worker: any;
let linkReader: any;
let addressSeed = 0;

/**
 * Boots the run's universe.
 *
 * Order matters and is why this is one function: the listener has to be accepting
 * connections, and its address has to be in `process.env`, before the worker
 * module is composed. A worker composed first would have resolved the recording
 * adapter and nothing below would notice.
 */
export async function openE01World(): Promise<void> {
  const databaseUrl = requiredEnv('E2E_DATABASE_URL');
  const repoRoot = requiredEnv('E2E_REPO_ROOT');

  const { startSmtpCapture } =
    (await import('../../../support/app12/n01s1-smtp-capture.mjs')) as any;
  smtp = await startSmtpCapture({ repoRoot });
  Object.assign(process.env, smtp.workerEnv());

  const { createApp4E01Runtime } = await import('../../../support/app4/app4-runtime.mjs');
  const { createWorkerControl } = (await import('../../../support/app4/worker-control.mjs')) as any;
  linkReader = await import('../../../support/app12/e01-secure-link.mjs');

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
  proofs['smtpCaptureListening'] = smtp.port > 0;
}

export async function closeE01World(label: string): Promise<void> {
  await runtime?.close?.();
  await smtp?.close?.();
  runtime = undefined;
  worker = undefined;
  smtp = undefined;
  process.stdout.write(`${label} ${JSON.stringify(proofs)}\n`);
}

/**
 * The class name of the adapter the worker's DI graph actually resolved.
 *
 * Read from the composed container, never from the environment, for the reason
 * `APP12-N01.S01` recorded: the environment said `SMTP` through two runs that
 * were serving stale builds in which the recording adapter was still bound
 * unconditionally. A stale `dist`, a reverted factory or a misresolved provider
 * all answer `RecordingNotificationChannelAdapter` here.
 */
export function resolvedChannelAdapterName(): string {
  const requireFromWorker = createRequire(
    `${requiredEnv('E2E_REPO_ROOT')}/apps/worker/package.json`,
  );
  const { NOTIFICATION_CHANNEL_PORT } = requireFromWorker(
    './dist/jobs/notification-delivery/domain/channel/notification-channel.port.js',
  );
  return String(runtime.workerContext.get(NOTIFICATION_CHANNEL_PORT).constructor.name);
}

/** Whether this run's composed worker really delivers over SMTP. */
export function smtpTransportIsLive(): boolean {
  return (
    process.env['NOTIFICATION_TRANSPORT'] === 'SMTP' &&
    smtp !== undefined &&
    resolvedChannelAdapterName() === 'SmtpNotificationChannelAdapter'
  );
}

/** Drains the queue, one attempt at a time, until nothing is due. */
export async function runWorkerUntilIdle(limit = 40): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    const attempt = await worker.runOnce();
    if (attempt === undefined) return;
  }
  throw new Error(`The worker was still finding due jobs after ${String(limit)} attempts.`);
}

/** A fresh synthetic recipient. `@vidu.test` forwards nowhere. */
export function nextAddress(): string {
  addressSeed += 1;
  return `app12-e01-${String(addressSeed)}@vidu.test`;
}

/** How many messages this run's listener has accepted. Never their contents. */
export function capturedCount(): number {
  return smtp.count() as number;
}

/** A checkout address, composed exactly as `APP12-S01`'s purchase panel does. */
export function checkoutUrl(quantity = '1'): string {
  const query = new URLSearchParams({ sku: MAIN_SKU(), quantity });
  return `/mua-hang/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}?${query.toString()}`;
}

/**
 * Verifies the contact with the code that was **in the delivered message**.
 *
 * The code is read between the two driver calls and never leaves this function.
 */
export async function verifyThroughDeliveredEmail(page: Page, address: string): Promise<void> {
  const driver = createS01Driver(page);
  const url = page.url();

  // Retried for the reason `APP12-S02-C1` records: the band is a disabled
  // `<fieldset>` until React's mount effect enables it, so the control may
  // simply not be operable yet on the first attempt. The `?sku=` guard is the
  // standing regression against the pre-hydration native GET.
  await expect(async () => {
    if (new URL(page.url()).searchParams.get('sku') === null) await page.goto(url);
    await driver.enterContact(address);
    await driver.submitContact();
    await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get('sku')).not.toBeNull();

  // The API raised the intent; the worker is what puts a message on the wire.
  // This topology holds the poll loop closed so a background loop cannot race
  // the assertions, so the run pumps it explicitly.
  await runWorkerUntilIdle();

  await driver.enterCode(codeDeliveredTo(address));
  await driver.submitCode();
  await expect(page.getByText(S02_COPY.verified)).toBeVisible();
}

/** The newest captured code for one recipient. A secret; typed, never asserted. */
function codeDeliveredTo(address: string): string {
  const messages = smtp.messagesFor(address) as any[];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const code = smtp.codeOf(messages[index]) as string | undefined;
    if (code !== undefined) return code;
  }
  throw new Error(
    `No captured SMTP message for that recipient carried a six-digit code ` +
      `(${String(messages.length)} message(s) accepted).`,
  );
}

export interface PlacedOrder {
  readonly orderCode: string;
  /** The synthetic recipient. Never logged. */
  readonly address: string;
}

/** Places one real Ready-Made order through the delivered checkout. */
export async function placeOrder(page: Page): Promise<PlacedOrder> {
  const address = nextAddress();
  await page.goto(checkoutUrl());
  await verifyThroughDeliveredEmail(page, address);
  await fillDelivery(page);

  await page.getByRole('button', { name: S02_COPY.submit }).click();
  await expect(page.getByRole('heading', { name: S02_COPY.successTitle })).toBeVisible({
    timeout: 20_000,
  });

  const printed = (await page.locator('.ready-made-checkout__order-code').innerText()).trim();
  const match = /ORD-[A-Z0-9]+/.exec(printed);
  expect(match, 'the success panel printed an order code').not.toBeNull();

  // The `ORDER_ACCESS` notification the creation raised, put on the wire.
  await runWorkerUntilIdle();
  return { orderCode: match![0], address };
}

/**
 * Safe facts about the `ORDER_ACCESS` link delivered to one recipient.
 *
 * The origin and path are not secrets — the origin is the value an operator
 * configures — so naming them in a failure message is what makes
 * `FU-APP12-H02-01` readable evidence rather than a bare boolean. The fragment
 * never appears.
 */
export function deliveredOrderAccessProof(address: string): Record<string, unknown> {
  return linkReader.secureLinkOriginProof(findOrderAccessLink(address));
}

/**
 * Opens the secure order surface from the **exact delivered link**.
 *
 * No path repair, no token rewriting, no re-composition: this is the URL the
 * customer's own message carries. By the time it returns, `location.hash` is
 * empty, so no screenshot any case takes can observe the fragment.
 */
export async function openDeliveredOrderAccess(page: Page, address: string): Promise<void> {
  const link = findOrderAccessLink(address);
  expect(link, 'a delivered ORDER_ACCESS link was captured').toBeDefined();
  await page.goto(link!);
  await expect
    .poll(async () => (await page.evaluate(() => window.location.hash)) === '', {
      timeout: 20_000,
    })
    .toBe(true);
}

function findOrderAccessLink(address: string): string | undefined {
  const messages = smtp.messagesFor(address) as any[];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const link = linkReader.secureLinkFrom(messages[index], ORDER_ACCESS_PATH) as
      string | undefined;
    if (link !== undefined) return link;
  }
  return undefined;
}
