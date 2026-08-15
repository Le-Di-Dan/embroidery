/**
 * The `APP4-E01-H02` helper-readiness smoke.
 *
 * Proves the evidence layer is wired to the real applications — and nothing
 * more. It issues no challenge, submits no code, creates no Customer, issues no
 * grant, delivers no notification and neither revokes nor replays. Helper
 * readiness is not acceptance evidence; `E01-01..E01-18` belong to `R01`.
 *
 * The APP4 runtime foundation (H01) is deliberately *not* booted here: this
 * process is a Playwright worker, and R01 will compose the runtime in the
 * process that also reads the recording sink. What this smoke proves about the
 * runtime layer is proven by the H01 smoke, which owns it.
 */
import { expect, test } from '@playwright/test';

import { createA01Driver } from './support/a01-customer-access-driver';
import { createS01Driver, S01 } from './support/s01-verification-driver';
import {
  installFragmentInstrumentation,
  readFragmentSecurityEvidence,
} from './support/s02-fragment-instrumentation';
import { observeNetwork } from './support/network-observer';
import { scanBrowserForSecret } from './support/browser-secret-scan';
import { loginAsAdmin } from '../app1/support/admin-auth';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the H02 smoke.`);
  }
  return value;
}

test.describe('APP4-E01-H02 helper readiness', () => {
  test('Storefront S01 initial contact UI is identified by the driver', async ({ page }) => {
    const s01 = createS01Driver(page);
    const network = observeNetwork(page);

    await s01.openVerification();

    // The driver's own state reader agrees with the screen it opened.
    expect(await s01.readVisibleVerificationState()).toBe('CONTACT_ENTRY');
    // Both contact kinds are reachable through accessible selectors alone.
    await s01.chooseContactKind('EMAIL');
    await expect(page.getByLabel(S01.emailLabel, { exact: true })).toBeVisible();
    await s01.chooseContactKind('PHONE');
    await expect(page.getByLabel(S01.phoneLabel, { exact: true })).toBeVisible();
    // The submit control exists and is the approved copy — never clicked here,
    // because clicking it would issue a challenge.
    await expect(page.getByRole('button', { name: S01.submitContact })).toBeVisible();

    network.stop();
  });

  test('S02 fragment instrumentation installs before application scripts', async ({ page }) => {
    // A synthetic marker, not a real token: no grant exists in this smoke, and
    // the instrumentation only needs something to look for.
    const marker = 'h02-instrumentation-marker';
    await installFragmentInstrumentation(page, marker);

    await page.goto('/truy-cap');

    // The recorder survived hydration and is readable — which is the mechanism
    // under test. No resolve request is expected: there is no fragment, so S02
    // never calls B06, and `requestObserved` must therefore be false.
    const evidence = await readFragmentSecurityEvidence(page);
    expect(evidence.requestObserved).toBe(false);
    expect(evidence.requestBodyHasTokenField).toBe(false);
    // Next's own hydration replaceState may or may not have run; what must hold
    // is that no *cleaning* transition was mis-detected without a fragment.
    expect(evidence.cleaningReplaceStateObserved).toBe(false);

    // The browser scanner runs against a real page and finds nothing.
    const scan = await scanBrowserForSecret(page, marker);
    expect(scan.present).toBe(false);
    expect(scan.surfaces).toEqual([]);
  });

  test('Admin A01 lookup UI is identified after a real login', async ({ page }) => {
    const admin = {
      email: requiredEnv('E2E_ADMIN_EMAIL'),
      password: requiredEnv('E2E_ADMIN_PASSWORD'),
      displayName: requiredEnv('E2E_ADMIN_DISPLAY_NAME'),
    };
    // The accepted APP1 mechanism: the real form, no injected cookie.
    await loginAsAdmin(page, admin);

    const a01 = createA01Driver(page);
    await a01.openCustomerAccessSupport();

    expect(a01.isStillOnSupportRoute()).toBe(true);
    // The lookup control set the driver depends on is present. No lookup is
    // submitted: there is no verified Customer in this smoke, and resolving one
    // is R01's evidence, not H02's.
    await expect(page.getByLabel('Email hoặc số điện thoại', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tra cứu' })).toBeVisible();
    expect(await a01.isLookupDraftCleared()).toBe(true);
  });
});
