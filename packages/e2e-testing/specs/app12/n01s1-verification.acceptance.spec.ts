/**
 * `APP12-N01.S01` — the email-only verification UX, in a real browser, against a
 * real SMTP boundary.
 *
 * The run proves three things that no earlier suite could:
 *
 * 1. **The message leaves the process.** The worker is composed with
 *    `NOTIFICATION_TRANSPORT=SMTP` and delivers over TCP to a loopback capture
 *    listener. The code the browser types is parsed out of that message — never
 *    read from the worker's memory, which `S01` §18 forbids and which every
 *    verification run before this one did.
 * 2. **Email is the only channel a customer can name.** Asserted as absence, on
 *    every screen the flow renders, at both viewports: no chooser, no second
 *    field, no SMS wording, no control that could issue a non-email request.
 * 3. **The success state says which thing was verified.** "Email đã được xác
 *    minh", not a generic contact.
 *
 * The journey stops at verification. Order creation, payment and the rest of
 * `APP12-U01` are not this package's, and nothing here creates an order.
 *
 * Nothing secret is written anywhere. The code passes through one function into
 * one field; the synthetic `@vidu.test` addresses reach a listener that forwards
 * nowhere, so `REAL_INBOX_MANUAL` remains `NOT_EXECUTED`.
 */
import { expect, test, type Page } from '@playwright/test';

import { createS01Driver } from '../app4/support/s01-verification-driver';
import {
  COPY,
  FORBIDDEN_CHANNEL_WORDS,
  VERIFICATION_PATH,
  capturedCount,
  capturedFor,
  checkoutUrl,
  closeN01S1World,
  codeDeliveredTo,
  nextAddress,
  openN01S1World,
  proofs,
  resolvedChannelAdapterName,
  runWorkerUntilIdle,
  safeMessage,
  smtpTransportIsLive,
  verifyThroughEmail,
} from './support/n01s1-world';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial' });

test.beforeAll(openN01S1World);
test.afterAll(() => closeN01S1World('APP12-N01-S01-PROOFS'));

/** The 390 primary and the 1440 bounded smoke, and nothing between them. */
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;

/**
 * Every phone/SMS affordance this checkpoint removed, checked as absence.
 *
 * Scoped to a locator rather than the page when the caller passes one, because
 * the checkout page legitimately carries a delivery phone field — that is the
 * distinction `S01` §5 draws and the one this helper has to respect.
 */
async function expectNoChannelAffordance(scope: any, label: string): Promise<void> {
  await expect(scope.getByRole('radio')).toHaveCount(0);
  await expect(scope.getByRole('combobox')).toHaveCount(0);
  await expect(scope.locator('input[type="tel"]')).toHaveCount(0);

  const text = await scope.innerText();
  for (const forbidden of FORBIDDEN_CHANNEL_WORDS) {
    expect(text, `${label} says nothing about ${forbidden}`).not.toContain(forbidden);
  }
  proofs[`noChannelAffordance:${label}`] = true;
}

test.describe('APP12-N01.S01 — the SMTP-backed browser journey', () => {
  test('the composed worker really uses the SMTP transport', () => {
    // The guard that stops the rest of this file from passing vacuously, asked
    // of the DI graph rather than of the environment — see the world's note on
    // the two runs an environment-only check waved through.
    expect(resolvedChannelAdapterName()).toBe('SmtpNotificationChannelAdapter');
    expect(smtpTransportIsLive(), 'the run composed a delivering SMTP transport').toBe(true);
    proofs['smtpTransportLive'] = true;
  });

  for (const viewport of VIEWPORTS) {
    test(`a customer verifies by email at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const address = nextAddress();
      const before = capturedCount();

      // 1–3. The Ready-Made checkout's verification card is the surface under
      // test, and it opens on email with no method to choose.
      await page.goto(checkoutUrl());
      const card = page.getByRole('region', { name: COPY.contactHeading });
      await expect(card.getByRole('heading', { name: COPY.contactTitle })).toBeVisible();
      await expect(card.getByText(COPY.contactBody)).toBeVisible();
      await expectNoChannelAffordance(card, `checkout-contact-${viewport.name}`);
      await expect(card.getByRole('textbox')).toHaveCount(1);

      // The delivery card still asks for a phone number, and must: a recipient's
      // number is a delivery fact, not a verification channel (§5).
      await expect(page.getByLabel(COPY.deliveryPhone)).toBeVisible();

      // 4–9. Request, deliver over SMTP, read the code out of the message, and
      // answer in the real browser.
      await verifyThroughEmail(page, address);

      // 6. Exactly one message, to exactly this address.
      const messages = capturedFor(address);
      expect(messages).toHaveLength(1);
      expect(capturedCount() - before, 'the journey produced one message and no other').toBe(1);
      const safe = safeMessage(messages[0]);
      expect(safe['recipientCount']).toBe(1);
      expect(safe['hasSubject']).toBe(true);
      expect(safe['hasTextPart']).toBe(true);
      expect(safe['hasHtmlPart']).toBe(true);
      expect(safe['hasCode']).toBe(true);
      proofs[`message:${viewport.name}`] = JSON.stringify(safe);

      // 10. The settled state names the thing that was verified.
      await expect(page.getByText(COPY.checkoutVerified)).toBeVisible();
      await expect(page.getByRole('button', { name: COPY.changeContact })).toBeVisible();
      proofs[`verified:${viewport.name}`] = true;

      // No horizontal overflow at either width, and 390 is the one that matters.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(0);
      proofs[`overflow:${viewport.name}`] = overflow;
    });
  }

  test('the code the browser used came from the captured message', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const address = nextAddress();
    const driver = createS01Driver(page);

    await page.goto(VERIFICATION_PATH);
    await expect(page.getByRole('heading', { level: 1, name: COPY.pageTitle })).toBeVisible();

    await driver.enterContact(address);
    await driver.submitContact();
    await driver.waitForCodeEntry();

    // Before the worker runs there is no message and therefore no code — which
    // is the proof that the code is the message's, not the process's. A wrong
    // code here would be a mismatch; the run does not submit one, because the
    // point is what exists, not what the server refuses.
    expect(capturedFor(address)).toHaveLength(0);
    await runWorkerUntilIdle();
    expect(capturedFor(address)).toHaveLength(1);

    await driver.enterCode(codeDeliveredTo(address));
    await driver.submitCode();
    await driver.waitForSuccess();
    proofs['codeFromCapturedMessage'] = true;
  });

  test('a resend delivers a second message and no method switch', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const address = nextAddress();
    const driver = createS01Driver(page);

    await page.goto(VERIFICATION_PATH);
    await driver.enterContact(address);
    await driver.submitContact();
    await driver.waitForCodeEntry();
    await runWorkerUntilIdle();
    expect(capturedFor(address)).toHaveLength(1);

    // The resend control is the only other action on this card, and it names no
    // channel. It is disabled until the server's own `resendAvailableAt`, which
    // is why this asserts the state rather than clicking through a cooldown the
    // suite would otherwise have to wait out.
    const resend = page.getByRole('button', { name: COPY.resend });
    await expect(resend).toBeVisible();
    await expect(resend).toBeDisabled();
    await expectNoChannelAffordance(page.locator('form'), 'code-entry-390');
    proofs['resendIsEmailOnly'] = true;
  });

  test('no verification screen offers a phone affordance at 1440', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const driver = createS01Driver(page);

    await page.goto(VERIFICATION_PATH);
    // Scoped to the verification card, not the whole page: the Storefront's
    // store-presentation footer legitimately carries the workshop's own contact
    // details, and a shop's telephone number is not a verification affordance.
    // What this checkpoint removed lives inside this section, so this is where
    // its absence means something.
    await expectNoChannelAffordance(
      page.locator('section.contact-verification'),
      'verification-route-1440',
    );
    await expect(driver.contactField()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(1);
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    proofs['routeIsEmailOnly1440'] = true;
  });
});

test.describe('APP12-N01.S01 — accessibility', () => {
  for (const viewport of VIEWPORTS) {
    test(`the verification card has no serious or critical violation at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(VERIFICATION_PATH);
      await expect(page.getByRole('heading', { level: 1, name: COPY.pageTitle })).toBeVisible();

      await assertNoGatedViolations(page, `n01s1-contact-entry-${viewport.name}`);

      // The code-entry card is the other half of the flow and carries the OTP
      // field, its label, the disabled resend and the error region — the four
      // relationships §16 asks to be proved.
      const address = nextAddress();
      const driver = createS01Driver(page);
      await driver.enterContact(address);
      await driver.submitContact();
      await driver.waitForCodeEntry();

      const codeField = page.getByLabel(COPY.codeLabel);
      await expect(codeField).toBeVisible();
      await expect(codeField).toHaveAttribute('autocomplete', 'one-time-code');

      await assertNoGatedViolations(page, `n01s1-code-entry-${viewport.name}`);
    });
  }
});

/**
 * One axe pass at the WCAG 2.2 AA tag set, gated on serious and critical.
 *
 * `color-contrast` is disabled for the reason `APP12-H08` recorded and
 * `PO-APP12-004` assigned: the failing values are three *locked* shared design
 * tokens, owned by `APP12-V02`, and no checkpoint may quietly re-decide them.
 * Nothing else is disabled.
 */
async function assertNoGatedViolations(page: Page, label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = await runAxe(page, { label, disableRules: ['color-contrast'] });
  expect(scan.gated, `${label}: ${describeViolations(scan)}`).toHaveLength(0);
  proofs[`axe:${label}`] = scan.gated.length;
}
