/**
 * The world of the `APP12-N01.S01` browser acceptance.
 *
 * ## What is different from every verification run before it
 *
 * The topology is `APP12-S02`'s — a real Storefront, a real API, the real
 * `APP4` verification lane, an in-process worker whose poll loop is held closed
 * so the run pumps it deliberately, and the run's disposable database. One
 * thing changes, and it is the whole point of the checkpoint:
 *
 * ```text
 * before   NOTIFICATION_TRANSPORT unset → recording adapter → an array in RAM
 * here     NOTIFICATION_TRANSPORT=SMTP  → real TCP → a capture listener
 * ```
 *
 * The code the browser types is parsed out of the **captured message**, not read
 * from the worker's memory (`S01` §18). That distinction is the difference
 * between proving the API minted a code and proving one left the process — and
 * the second is the thing `APP12-U01` blocked on.
 *
 * The environment is set on `process.env` before the worker context is built,
 * because `notificationChannelProvider` resolves the transport at composition
 * and fails closed if it cannot. Setting it afterwards would silently leave the
 * recording adapter in place and the run would pass while proving nothing —
 * which is why `smtpTransportIsLive()` exists and every spec asserts it first.
 *
 * ## What never crosses this boundary
 *
 * The code is returned by one function, straight into a field. It is not logged,
 * not attached, not compared with an operand-printing matcher, and not part of
 * `proofs`. The synthetic `@vidu.test` addresses reach a loopback listener that
 * forwards nowhere, so no real inbox is involved: `REAL_INBOX_MANUAL` stays
 * `NOT_EXECUTED`.
 *
 * Test-only.
 */
import { createRequire } from 'node:module';

import { expect, type Page } from '@playwright/test';

import { createS01Driver } from '../../app4/support/s01-verification-driver';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `APP12-S02`, this module treats those imports as `any` and lets each
   explicit `expect` in the specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-N01.S01 acceptance run.`);
  }
  return value;
}

/**
 * The approved email-only copy, duplicated here as a test expectation.
 *
 * Deliberately literal rather than imported from the Storefront's catalog: a
 * test that reads the same constant the component reads cannot notice a copy
 * change, and copy is exactly what this checkpoint changed.
 */
export const COPY = {
  pageTitle: 'Xác minh email',
  contactTitle: 'Xác minh email của bạn',
  contactBody: 'Nhập email để nhận mã xác thực gồm 6 chữ số.',
  emailLabel: 'Email',
  submitContact: 'Gửi mã',
  codeTitle: 'Nhập mã xác minh',
  codeLabel: 'Mã xác minh (6 chữ số)',
  submitCode: 'Xác minh',
  resend: 'Gửi lại mã',
  checkoutVerified: 'Email đã được xác minh',
  changeContact: 'Đổi email',
  contactHeading: 'Liên hệ',
  deliveryPhone: 'Số điện thoại người nhận',
} as const;

/**
 * What the delivered message itself must say (`APP12-N01.E01` §8).
 *
 * Literal for the same reason `COPY` is: an expectation that imports the
 * renderer's own constants would agree with any wording the renderer adopts,
 * including a wrong one. `sender` is the address the capture harness composes
 * the worker with, so asserting it proves the configured sender reached the
 * envelope rather than a default.
 */
export const EMAIL = {
  sender: 'no-reply@vidu.test',
  subject: 'Mã xác thực Nét Thêu',
  brand: 'Nét Thêu',
  ignoreGuidance: 'Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email này.',
} as const;

/**
 * Vietnamese and English wording that would only appear if a phone or SMS
 * verification affordance came back. Asserted absent on every screen the flow
 * renders (`S01` §19).
 *
 * `Số điện thoại người nhận` — the delivery recipient's number — is legitimate
 * and is checked separately, so the forbidden fragment is the bare label, and
 * the caller excludes the delivery card when it scans the checkout page.
 */
export const FORBIDDEN_CHANNEL_WORDS = [
  'SMS',
  'tin nhắn',
  'Zalo',
  'Nhận mã qua điện thoại',
  'Xác minh qua số điện thoại',
  'Gửi mã SMS',
] as const;

let runtime: any;
let worker: any;
let smtp: any;
let contactSeed = 0;

/** Safe facts only: booleans, counts and copy. Never a code or an address. */
export const proofs: Record<string, boolean | number | string> = {};

/** A checkout address, composed exactly as `APP12-S01`'s panel composes it. */
export function checkoutUrl(): string {
  const query = new URLSearchParams({
    sku: requiredEnv('E2E_APP12_S02_MAIN_SKU'),
    quantity: '1',
  });
  return `/mua-hang/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}?${query.toString()}`;
}

/** The standalone verification route, which the same card also serves. */
export const VERIFICATION_PATH = '/xac-minh-lien-he';

/**
 * Boots the run's universe with a delivering SMTP transport.
 *
 * Order matters and is the reason this is one function: the capture listener has
 * to be accepting connections, and its address has to be in `process.env`,
 * before the worker module is composed.
 */
export async function openN01S1World(): Promise<void> {
  const databaseUrl = requiredEnv('E2E_DATABASE_URL');
  const repoRoot = requiredEnv('E2E_REPO_ROOT');

  const { startSmtpCapture } =
    (await import('../../../support/app12/n01s1-smtp-capture.mjs')) as any;
  smtp = await startSmtpCapture({ repoRoot });
  Object.assign(process.env, smtp.workerEnv());

  const { createApp4E01Runtime } = await import('../../../support/app4/app4-runtime.mjs');
  const { createWorkerControl } = (await import('../../../support/app4/worker-control.mjs')) as any;

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

/** Closes the universe and prints the run's safe proofs. */
export async function closeN01S1World(label: string): Promise<void> {
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
 * **Read from the composed container, not from the environment**, and that
 * distinction cost this suite its first two runs. The environment said `SMTP`
 * both times; the first run served a Storefront build that predated the
 * checkpoint, and the second ran a worker `dist` that predated `N01.B01`
 * entirely — a build in which `notification-channel.factory` did not exist and
 * the module still bound the recording adapter unconditionally. An
 * environment-only guard reported a live transport in exactly the situation it
 * was written to catch.
 *
 * So the guard asks the graph. A stale `dist`, a reverted factory or a
 * misresolved provider all answer `RecordingNotificationChannelAdapter` here,
 * and the suite stops before it can report a green journey while proving
 * precisely what `S01` §18 forbids.
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

/** Whether the composed worker really resolved the SMTP adapter. */
export function smtpTransportIsLive(): boolean {
  return (
    process.env['NOTIFICATION_TRANSPORT'] === 'SMTP' &&
    smtp !== undefined &&
    resolvedChannelAdapterName() === 'SmtpNotificationChannelAdapter'
  );
}

/** How many messages the listener has accepted for one address. */
export function capturedFor(address: string): any[] {
  return smtp.messagesFor(address);
}

/** Safe facts about one captured message — never its contents. */
export function safeMessage(message: any): Record<string, unknown> {
  return smtp.safeMessage(message);
}

/**
 * `APP12-N01.E01` §8 for one captured message: booleans and leak names only.
 *
 * The comparison happens inside the capture harness, so the code and the bodies
 * never reach a Playwright matcher — a failed expectation names the field that
 * was wrong and prints nothing that was secret.
 */
export function contentProof(
  message: any,
  expected: {
    recipient: string;
    minutes: number;
    forbidden: ReadonlyArray<{ name: string; value: string | undefined }>;
  },
): Record<string, unknown> {
  return smtp.contentProof(message, {
    recipient: expected.recipient,
    sender: EMAIL.sender,
    subject: EMAIL.subject,
    brand: EMAIL.brand,
    ignoreGuidance: EMAIL.ignoreGuidance,
    minutes: expected.minutes,
    forbidden: expected.forbidden,
  }) as Record<string, unknown>;
}

/** The SMTP password this run generated, so a spec can prove it never shipped. */
export function smtpPassword(): string {
  return String(smtp.workerEnv()['SMTP_PASSWORD']);
}

/** Total messages this listener has accepted, across every address. */
export function capturedCount(): number {
  return smtp.count();
}

/**
 * Drains the held worker until nothing is due.
 *
 * The poll loop is closed by `WORKER_STARTUP_GATE`, exactly as `APP12-S02`
 * holds it, so a background loop cannot race an assertion about how many
 * messages exist.
 */
export async function runWorkerUntilIdle(guard = 12): Promise<number> {
  let executed = 0;
  for (let attempt = 0; attempt < guard; attempt += 1) {
    const summary = await worker.runOnce();
    if (summary === undefined) return executed;
    executed += 1;
  }
  throw new Error(`Worker still had due jobs after ${String(guard)} attempts.`);
}

/** A fresh synthetic address per journey, so no two share a challenge scope. */
export function nextAddress(): string {
  contactSeed += 1;
  return `app12-n01s1-${String(contactSeed)}@vidu.test`;
}

/**
 * The code carried by the newest message delivered to one address.
 *
 * **Read from the captured message, never from the worker.** A resend issues a
 * replacement challenge and the card is answering the newest one, so the newest
 * message is the only correct source — taking the oldest would answer a
 * challenge the server has already cancelled.
 *
 * The plaintext is returned to be typed into a field and nowhere else.
 */
export function codeDeliveredTo(address: string): string {
  const messages = capturedFor(address);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const code = smtp.codeOf(messages[index]) as string | undefined;
    if (code !== undefined) return code;
  }
  throw new Error(
    `No captured SMTP message for that recipient carried a six-digit code ` +
      `(${String(messages.length)} message(s) accepted).`,
  );
}

/**
 * The full request → deliver → answer journey, ending verified.
 *
 * Returns the address so a caller that must re-verify the same contact can, and
 * so a caller can count exactly the messages this journey produced.
 */
export async function verifyThroughEmail(page: Page, address: string): Promise<void> {
  const driver = createS01Driver(page);
  const before = capturedFor(address).length;

  // Retried for the reason `APP12-S02` records: the band is a disabled
  // `<fieldset>` until React's mount effect enables it (`APP12-S02-C1`), so the
  // control may simply not be operable yet on the first attempt.
  await expect(async () => {
    await driver.enterContact(address);
    await driver.submitContact();
    await expect(page.getByRole('heading', { name: COPY.codeTitle })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });

  // The API accepted the request and raised the intent; the worker is what turns
  // that into an SMTP session. Nothing is due until it runs.
  await runWorkerUntilIdle();
  expect(capturedFor(address).length, 'exactly one message was accepted for this address').toBe(
    before + 1,
  );

  await driver.enterCode(codeDeliveredTo(address));
  await driver.submitCode();
}
