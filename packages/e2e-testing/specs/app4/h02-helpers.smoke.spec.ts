/**
 * The `APP4-E01-H02` helper-readiness smoke.
 *
 * Proves the evidence layer is wired to the real applications — and nothing
 * more. It issues no challenge, submits no code, creates no Customer, issues no
 * grant, delivers no notification and neither revokes nor replays. Helper
 * readiness is not acceptance evidence; `E01-01..E01-18` belong to `R01`.
 *
 * The last test boots H01's runtime foundation in this process, which is how
 * `R01` will use it too: the process that executes W01 must be the process that
 * reads the recording sink, or the delivered secret would have to cross a
 * boundary to be observed. Here it only proves the sink starts empty and the
 * poll gate is held — no job is claimed and nothing is delivered.
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
    // The one contact field is reachable through accessible selectors alone.
    // This case used to toggle an EMAIL/PHONE chooser; `APP12-N01.S01` locked
    // verification to email and removed it, so what the driver must now find is
    // a single email field — and the absence of any chooser is asserted here so
    // a reinstated one fails the helper smoke before it reaches a journey.
    await expect(s01.contactField()).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
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

    const response = await page.goto('/truy-cap');

    // Assert the real S02 route answered *before* reading the recorder. Every
    // evidence field below is falsy on a 404 too, so without this the whole
    // test would pass against a page that does not exist — which is exactly
    // what happened when the built app predated the route.
    expect(response?.status()).toBe(200);
    // The page's own `h1`, not "some heading". The loose matcher passed only
    // while this mode's Storefront ran without `STOREFRONT_PUBLIC_ORIGIN` and
    // rendered a stump; with the process configured (see `run-e2e.mjs`) the
    // real page arrives complete, store-presentation footer and all, and five
    // headings fail Playwright's strict mode. What this line is for is that the
    // route answered with a page rather than an error, and the `h1` says that.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

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

  test('evidence and worker helpers are alive against the run universe', async () => {
    // Booting two real Nest contexts from compiled dist costs more than the
    // 30s default. Playwright takes this from `setTimeout`, not from a third
    // argument to `test` — that position is `TestDetails`, and a number there is
    // silently not a timeout.
    test.setTimeout(180_000);

    // The helper layer is authored as plain ESM `.mjs` (it runs outside a TS
    // transform, in this process and in H01's), so the shapes this spec depends
    // on are declared here rather than inferred. Narrow on purpose: only what is
    // asserted below.
    interface DbEvidence {
      countCustomers(): Promise<number>;
      close(): Promise<void>;
    }
    interface WorkerControl {
      deliveryCount(): number;
      runOnce(): Promise<unknown>;
    }
    interface App4Runtime {
      // The three handles `createWorkerControl` resolves its providers from;
      // declared because TypeScript reads the helper's own JSDoc contract.
      workerContext: object;
      jobExecutionService: object;
      recordingAdapter: object;
      close(): Promise<void>;
    }

    const databaseUrl = requiredEnv('E2E_DATABASE_URL');
    const { createDbEvidence } = (await import('../../support/app4/db-evidence.mjs')) as {
      createDbEvidence: (url: string) => Promise<DbEvidence>;
    };
    const { createApp4E01Runtime } = (await import('../../support/app4/app4-runtime.mjs')) as {
      createApp4E01Runtime: (options: {
        runId: string;
        app4: object;
        databaseUrl?: string;
      }) => Promise<App4Runtime>;
    };
    const { createWorkerControl } = (await import('../../support/app4/worker-control.mjs')) as {
      createWorkerControl: (runtime: App4Runtime) => WorkerControl;
    };

    const evidence = await createDbEvidence(databaseUrl);
    try {
      // Alive against the real disposable database, and reading nothing that
      // does not exist yet: no fixture has run, so the universe is empty.
      expect(await evidence.countCustomers()).toBe(0);
    } finally {
      await evidence.close();
    }

    const runtime = await createApp4E01Runtime({
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
    try {
      const worker = createWorkerControl(runtime);
      // `records()` is a method — calling it is the point. Reading `.records`
      // would measure the function's arity, which is also 0 and proves nothing.
      expect(worker.deliveryCount()).toBe(0);
      // Polling is held: nothing was claimed while the context has been up, so
      // there is no attempt to execute and no delivery to observe.
      expect(await worker.runOnce()).toBeUndefined();
      expect(worker.deliveryCount()).toBe(0);
    } finally {
      await runtime.close();
    }

    process.stdout.write('APP4_E01_H02_HELPERS_READY\n');
  });
});
