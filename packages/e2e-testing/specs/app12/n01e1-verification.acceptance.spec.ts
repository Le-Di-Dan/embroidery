/**
 * `APP12-N01.E01` — the final cross-boundary acceptance for email-only OTP.
 *
 * `S01` already proved the journey works and that the code the browser types
 * came out of a captured SMTP message. This package proves the thing `S01` left
 * unexamined: **what the message actually said**.
 *
 * The distinction matters because a delivery can cross the protocol boundary and
 * still be wrong — addressed to the wrong envelope recipient, sent from a
 * default rather than the configured sender, carrying an expiry that disagrees
 * with the challenge the API issued, missing the guidance a person who did not
 * ask for a code needs, or carrying an internal identifier that has no business
 * leaving the system. Every one of those passes a `hasSubject`-style check.
 *
 * So the assertions here read the wire bytes: the envelope, the decoded Subject,
 * and both decoded alternatives. The expiry check is a genuine cross-check
 * rather than a fixture — the browser captures the `expiresAt` the API returned
 * for *this* challenge, the spec converts it to minutes, and the message has to
 * agree.
 *
 * ## What this run does not prove
 *
 * That mail reaches a human inbox. The listener forwards nowhere, so no
 * synthetic address can produce real mail. `REAL_INBOX_MANUAL` stays
 * `NOT_EXECUTED` and belongs to the Product Owner.
 *
 * ## Secrets
 *
 * The code and the message bodies are compared inside the capture harness and
 * never reach a matcher. What crosses back into this file is booleans and the
 * *names* of anything that leaked — so a failure says "the SMTP password" and
 * prints no password.
 */
import { expect, test, type Page } from '@playwright/test';

import { createS01Driver } from '../app4/support/s01-verification-driver';
import {
  COPY,
  EMAIL,
  FORBIDDEN_CHANNEL_WORDS,
  capturedCount,
  capturedFor,
  checkoutUrl,
  closeN01S1World,
  codeDeliveredTo,
  contentProof,
  nextAddress,
  openN01S1World,
  proofs,
  resolvedChannelAdapterName,
  runWorkerUntilIdle,
  smtpPassword,
  smtpTransportIsLive,
} from './support/n01s1-world';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

test.describe.configure({ mode: 'serial' });

test.beforeAll(openN01S1World);
test.afterAll(() => closeN01S1World('APP12-N01-E01-PROOFS'));

/** The issue call, whose response carries this challenge's own expiry. */
const ISSUE_ENDPOINT = /\/public\/verification\/challenges$/;

/**
 * The challenge window, measured entirely on the server's own clock.
 *
 * **Both timestamps come from the same response**: `expiresAt` from the body and
 * the issuing instant from the HTTP `Date` header. The first version of this
 * check used `Date.now()` in the test process for the second one and failed
 * against a perfectly correct message — the API runs in a container whose clock
 * sits seconds ahead of the Windows host, so a true ten-minute window measured
 * across the two clocks read as eleven. That was a harness fault inventing a
 * product defect, which is the failure mode this suite exists to avoid, so the
 * host clock is not consulted at all any more.
 */
function serverWindowMs(expiresAt: string, serverDate: string): number {
  return Date.parse(expiresAt) - Date.parse(serverDate);
}

/**
 * Whether a stated whole-minute duration describes that window.
 *
 * The `Date` header has one-second granularity, so the window is only known to
 * within a second and an exact `ceil` comparison would be a coin flip whenever
 * the TTL lands near a minute boundary. A minute of tolerance is the honest
 * precision: it still fails a message that states 5 minutes for a 10-minute
 * challenge, a hardcoded string, or a renderer using a constant of its own —
 * which is what §8 actually asks — without pretending to a resolution the
 * transport never carried.
 */
function statesWindow(statedMinutes: unknown, windowMs: number): boolean {
  return (
    typeof statedMinutes === 'number' &&
    statedMinutes >= 1 &&
    Math.abs(statedMinutes * 60_000 - windowMs) <= 60_000
  );
}

/**
 * Runs one request through the browser and returns the challenge's own expiry.
 *
 * The response is read from the network rather than from the page, because the
 * expiry is not rendered — the card shows static copy, so the only place this
 * challenge's actual window exists on the client is the issue response.
 */
async function requestCode(
  page: Page,
  address: string,
): Promise<{ expiresAt: string; serverDate: string }> {
  const driver = createS01Driver(page);
  const waiting = page.waitForResponse(
    (response) => ISSUE_ENDPOINT.test(new URL(response.url()).pathname) && response.ok(),
  );
  await driver.contactField().fill(address);
  await driver.submitContact();
  const response = await waiting;
  const body = await response.json();
  const expiresAt = String(body?.data?.expiresAt ?? body?.expiresAt ?? '');
  const serverDate = String((await response.allHeaders())['date'] ?? '');
  expect(expiresAt, 'the issue response names this challenge expiry').not.toBe('');
  expect(serverDate, 'the issue response carries the server clock').not.toBe('');
  return { expiresAt, serverDate };
}

test.describe('APP12-N01.E01 — the delivery boundary', () => {
  test('the worker resolved the SMTP adapter, not a recording stand-in', () => {
    // The guard that makes every other assertion in this file mean something.
    // It asks the composed DI graph rather than the environment, because an
    // environment-only check passed twice against stale builds during S01.
    proofs['resolvedAdapter'] = resolvedChannelAdapterName();
    expect(resolvedChannelAdapterName()).toBe('SmtpNotificationChannelAdapter');
    expect(smtpTransportIsLive()).toBe(true);
  });

  test('one request produces exactly one message, and it is correct in every field', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(checkoutUrl());

    const address = nextAddress();
    const before = capturedCount();
    expect(capturedFor(address)).toHaveLength(0);

    const { expiresAt, serverDate } = await requestCode(page, address);
    await runWorkerUntilIdle();

    const messages = capturedFor(address);
    expect(messages, 'one intent delivered one message').toHaveLength(1);
    expect(capturedCount() - before, 'and no message to anybody else').toBe(1);

    const proof = contentProof(messages[0], {
      recipient: address,
      minutes: Math.max(1, Math.round(serverWindowMs(expiresAt, serverDate) / 60_000)),
      forbidden: [
        { name: 'the SMTP password', value: smtpPassword() },
        {
          name: 'the verification-code pepper',
          value: process.env['VERIFICATION_CODE_SECRET_PEPPER'],
        },
        { name: 'the secure-link pepper', value: process.env['SECURE_LINK_TOKEN_SECRET_PEPPER'] },
        {
          name: 'the delivery envelope key',
          value: process.env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'],
        },
        { name: 'the database URL', value: process.env['E2E_DATABASE_URL'] },
      ],
    });
    Object.assign(proofs, { emailContent: JSON.stringify(proof) });

    // §8, field by field. Each is a boolean the harness computed over the
    // decoded bytes; none of them carries what it was computed from.
    expect(proof['recipientIsRequested'], 'addressed to the requested email').toBe(true);
    expect(proof['senderIsConfigured'], 'sent from the configured sender').toBe(true);
    expect(proof['subjectIsVerificationIntent'], `subject is "${EMAIL.subject}"`).toBe(true);
    expect(proof['textPartExists'], 'a plain-text alternative exists').toBe(true);
    expect(proof['htmlPartExists'], 'an HTML alternative exists').toBe(true);
    expect(proof['codePresent'], 'the issued code is in the message').toBe(true);
    expect(
      statesWindow(proof['statedMinutes'], serverWindowMs(expiresAt, serverDate)),
      'the message states the challenge window, measured on the server clock',
    ).toBe(true);
    expect(proof['expiryAgreesWithChallenge'], 'both parts state that window').toBe(true);
    expect(proof['ignoreIfNotRequested'], 'it tells a recipient who did not ask').toBe(true);
    expect(proof['namesTheBrand'], 'it names the brand').toBe(true);
    expect(proof['leaks'], 'the message carries nothing it should not').toEqual([]);
  });

  test('the browser verifies with the code from that message, and says email', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(checkoutUrl());

    const address = nextAddress();
    await requestCode(page, address);
    await runWorkerUntilIdle();
    expect(capturedFor(address), 'a message to answer').toHaveLength(1);

    const driver = createS01Driver(page);
    await driver.waitForCodeEntry();
    await driver.enterCode(codeDeliveredTo(address));
    await driver.submitCode();

    await expect(page.getByText(COPY.checkoutVerified)).toBeVisible();
    proofs['verifiedFromCapturedCode:390'] = true;
  });

  test('draining the worker again delivers nothing a second time', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(checkoutUrl());

    const address = nextAddress();
    await requestCode(page, address);
    await runWorkerUntilIdle();
    const afterFirstDrain = capturedCount();

    // The intent is SATISFIED. A second drain must find nothing due — a
    // duplicate here would mean a customer receives the same code twice.
    await runWorkerUntilIdle();
    expect(capturedCount(), 'a satisfied intent is not delivered again').toBe(afterFirstDrain);
    expect(capturedFor(address)).toHaveLength(1);
    proofs['noDuplicateOnReplay'] = true;
  });
});

test.describe('APP12-N01.E01 — email is the only channel', () => {
  test('the 1440 smoke verifies and offers no phone affordance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(checkoutUrl());

    const card = page.getByRole('region', { name: COPY.contactHeading });
    const scope = (await card.count()) > 0 ? card : page.locator('main');

    await expect(scope.getByRole('radio')).toHaveCount(0);
    await expect(scope.getByRole('combobox')).toHaveCount(0);
    await expect(scope.locator('input[type="tel"]')).toHaveCount(0);

    const address = nextAddress();
    await requestCode(page, address);
    await runWorkerUntilIdle();

    const driver = createS01Driver(page);
    await driver.waitForCodeEntry();
    await driver.enterCode(codeDeliveredTo(address));
    await driver.submitCode();
    await expect(page.getByText(COPY.checkoutVerified)).toBeVisible();

    const text = await page.locator('main').innerText();
    for (const forbidden of FORBIDDEN_CHANNEL_WORDS) {
      expect(text, `the verified 1440 page says nothing about ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    proofs['smoke1440Verified'] = true;
  });

  test('no rendered screen ever exposes SMTP detail to a customer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(checkoutUrl());

    const address = nextAddress();
    await requestCode(page, address);
    await runWorkerUntilIdle();

    // Raw provider vocabulary is the failure mode: a transport error surfaced
    // verbatim tells a customer about a mail server they have no relationship
    // with, and tells an attacker about one they do.
    const html = await page.content();
    for (const leak of ['SMTP', 'smtp', 'nodemailer', 'ECONN', '535', '5.7.']) {
      expect(html, `the page shows no "${leak}"`).not.toContain(leak);
    }
    expect(html, 'the page does not carry the SMTP password').not.toContain(smtpPassword());
    proofs['noProviderDetailRendered'] = true;
  });
});
