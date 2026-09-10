/**
 * Opening a `FULL` payment attempt from the customer's own screen, step-up and all.
 *
 * Extracted at `APP12-E01` so there is **one** owner. `APP12-S03`'s lifecycle
 * suite wrote it, and E01's `PAYMENT_UNDER_REVIEW` scan needs exactly the same
 * flow: the review presentation is `AWAITING_PAYMENT` plus an attempt
 * outstanding, so a spec that cannot open an attempt cannot reach the state at
 * all. A second copy would have been a second idea of what "the customer started
 * paying" means, and the two would have drifted the first time the dialog
 * changed.
 *
 * Nothing about the behaviour changed in the move. Both callers drive the real
 * controls; neither calls an API.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

import { COPY } from './s03-world';

/* The harness helper layer is plain ESM `.mjs`, so the worker control arrives
   untyped — the same treatment `s03-world.ts` gives it, and the reason the
   explicit `expect`s below are the contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/**
 * Presses the one initiation control and follows whichever branch the server
 * chose, returning `true` when a step-up was actually demanded.
 *
 * Both outcomes are correct. What would **not** be correct — and what this
 * cannot hide — is an attempt opening with neither a step-up nor a fresh
 * verification behind it: the evidence section only appears once the server has
 * returned an attempt, so a refused initiation leaves this waiting.
 */
export async function initiateAttempt(page: Page, contact: string): Promise<boolean> {
  await page.getByRole('button', { name: COPY.startAttempt }).click();

  const stepUp = page.getByRole('heading', { name: COPY.stepUpTitle });
  const evidence = page.getByRole('heading', { name: COPY.evidenceTitle });
  try {
    await expect
      .poll(async () => (await stepUp.count()) > 0 || (await evidence.count()) > 0, {
        timeout: 45_000,
      })
      .toBe(true);
  } catch (error) {
    // Neither branch appeared, so the server refused. The approved refusal is
    // rendered as a note on the next-action card; naming it turns "nothing
    // happened" into the actual reason.
    const notice = await page.locator('.secure-order__note--danger').allInnerTexts();
    throw new Error(
      `initiation reached neither a step-up nor an attempt; page notice: ${
        notice.length === 0 ? '(none rendered)' : notice.join(' | ')
      }`,
      { cause: error },
    );
  }

  if ((await stepUp.count()) === 0) return false;
  await completeStepUp(page, contact);
  return true;
}

/**
 * Completes the embedded step-up with the code the real worker delivered.
 *
 * This is the whole APP4 verification machine running inside S03's dialog — the
 * same three cards, the same controls, differing only in `purpose: STEP_UP`. So
 * it is driven with the delivered APP4 driver rather than with selectors of its
 * own: if S03 had quietly built a second OTP flow, this helper could not drive
 * it, which is a stronger proof of reuse than any assertion about the source.
 *
 * The contact is the **same** one the order was placed with. A step-up for a
 * different address would leave the initiation refused for exactly the reason it
 * was refused before, and the journey would pass while proving nothing.
 *
 * The plaintext code is read from the recording adapter, typed into the field,
 * and never printed. It is found by kind rather than by position, because this
 * order has already produced a `SECURE_LINK_TOKEN` delivery and "the newest
 * delivery" would answer the wrong one.
 */
export async function completeStepUp(page: Page, contact: string): Promise<void> {
  const { s02Worker, runWorkerUntilIdle } = await import('./s02-world');
  const { createS01Driver } = await import('../../app4/support/s01-verification-driver');

  const worker = s02Worker();
  const driver = createS01Driver(page);
  const before = worker.deliveryCount() as number;

  await driver.enterContact(contact);
  await driver.submitContact();

  await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
    timeout: 20_000,
  });

  await runWorkerUntilIdle();

  let code: string | undefined;
  const end = worker.deliveryCount() as number;
  for (let index = end - 1; index >= before; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      code = worker.secretOf(index) as string;
      break;
    }
  }
  expect(code, 'a VERIFICATION_CODE delivery was recorded for the step-up').toBeDefined();

  await driver.enterCode(code!);
  await driver.submitCode();

  // The dialog reports success and the controller resumes the *same* initiation
  // with the *same* idempotency key, so the dialog closing is the observable.
  await expect(page.getByRole('heading', { name: COPY.stepUpTitle })).toHaveCount(0, {
    timeout: 30_000,
  });
}
