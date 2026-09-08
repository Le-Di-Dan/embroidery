/**
 * Playwright configuration for the APP0-T02B foundation smoke.
 *
 * Base URLs are the real gateway hostnames (never direct app ports). The
 * environment is owned entirely by `scripts/run-e2e.mjs`; there is deliberately
 * no `webServer` block so cleanup ownership stays outside Playwright (its
 * shutdown is insufficient on Windows). Direct execution (`playwright test`
 * without the wrapper) is only meaningful for `--list` in `check:e2e`.
 */
import { defineConfig, devices } from '@playwright/test';

import { app12V01Projects } from './playwright.projects.v01';

const STOREFRONT_URL = process.env.E2E_BASE_STOREFRONT ?? 'http://embroidery.local:8090';
const ADMIN_URL = process.env.E2E_BASE_ADMIN ?? 'http://admin.embroidery.local:8090';
const IS_CI = !!process.env.CI;

// On the host, Chromium resolves the gateway hostnames itself (Firefox/WebKit
// cannot, so they run only in the container where `--add-host` provides DNS).
const storefrontHost = new URL(STOREFRONT_URL).hostname;
const adminHost = new URL(ADMIN_URL).hostname;
const hostResolverArgs =
  process.env.E2E_RUNNER === 'container'
    ? []
    : [`--host-resolver-rules=MAP ${storefrontHost} 127.0.0.1, MAP ${adminHost} 127.0.0.1`];

const chromiumLaunch = { launchOptions: { args: hostResolverArgs } };

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 20_000,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'storefront-chromium',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-chromium',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    {
      name: 'storefront-firefox',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Firefox'], baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-firefox',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Firefox'], baseURL: ADMIN_URL },
    },
    {
      name: 'storefront-webkit',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Safari'], baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-webkit',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Safari'], baseURL: ADMIN_URL },
    },
    // APP1-E01 cross-layer acceptance (host/Chromium only — see run-e2e.mjs).
    {
      name: 'app1-admin-chromium',
      testMatch: '**/app1/admin-*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    {
      name: 'app1-storefront-chromium',
      testMatch: '**/app1/storefront-*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP4-E01-H02 helper readiness. Host/Chromium only, like the APP1 E01
    // projects and for the same reason. Split by base URL: the S01/S02 checks
    // run against the Storefront, the A01 check against the Admin.
    {
      name: 'app4-storefront-chromium',
      testMatch: '**/app4/h02-helpers.smoke.spec.ts',
      grepInvert: /Admin A01/,
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    {
      name: 'app4-admin-chromium',
      testMatch: '**/app4/h02-helpers.smoke.spec.ts',
      grep: /Admin A01/,
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    // APP4-E01-R01 canonical acceptance. One serial project on the Storefront
    // origin; the Admin journeys open their own context against the Admin
    // origin, because the run is one journey and cannot be split across two
    // projects without losing the state it accumulates.
    {
      name: 'app4-r01-chromium',
      testMatch: '**/app4/e01-r01.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP4-E01-R01-C1 — the correction, independent of the R01 serial spec.
    {
      name: 'app4-r01-c1-chromium',
      testMatch: '**/app4/e01-r01-c1.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP5-E01 cross-layer acceptance. One serial project on the Storefront
    // origin, for the same reason as `app4-r01-chromium`: the run is a single
    // journey chain whose state cannot be split across two projects. The Admin
    // journey opens its own context against the Admin origin.
    {
      name: 'app5-e01-chromium',
      testMatch: '**/app5/e01.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP7-E01 cross-layer acceptance. One serial project over both spec files,
    // for the same reason `app4-r01-chromium` is one: the run is a chain whose
    // committed state one case hands to the next, and Playwright gives no
    // ordering guarantee across projects. The Admin journeys open their own
    // context against the Admin origin. Desktop 1440 is the approved reference
    // viewport (`APP7-D01`), and the mobile-390 state resizes its own context.
    // APP12-S01 Ready-Made purchase state. One serial Storefront project: the
    // suite drives the three approved viewports itself with `test.use`, because
    // the responsive rule under test is one panel adapting rather than three
    // pages, and splitting it across projects would triple the environment cost
    // to prove the same thing. No Admin origin is involved — S01 is a public
    // read and opens no staff surface at all.
    {
      name: 'app12-s01-chromium',
      testMatch: '**/app12/s01-purchase-state.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP12-H06 Wave-1 SEO and public readiness. One Storefront project, and
    // deliberately the plainest one in this file: every case is an anonymous
    // GET whose subject is the rendered `<head>`, an HTTP status line, or a
    // metadata route's body. No viewport matters — none of it is visual — and
    // no case writes anything, so the suite is order-independent and needs no
    // serial worker.
    //
    // **`trace`, `video` and `screenshot` are set to `off` here explicitly**,
    // and that is a security control rather than a preference (`APP12-H06`
    // §14). The file-level defaults are `trace: 'retain-on-failure'` and
    // `screenshot: 'only-on-failure'`, so inheriting them would mean that the
    // first failing case on `/truy-cap/don-hang` writes a trace of a secure
    // customer surface to disk — the exact material this checkpoint exists to
    // prove is absent from published output. Off unconditionally, so a failure
    // cannot be the thing that creates the artefact.
    {
      name: 'app12-h06-chromium',
      testMatch: '**/app12/h06-seo.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: STOREFRONT_URL,
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    // APP12-S02 Ready-Made checkout. Serial and Storefront-only, for the same
    // reason as S01 — the suite drives the three approved viewports itself with
    // `test.use` — plus one this checkpoint adds: the run creates real orders in
    // sequence and each case counts the commercial rows the one before it left,
    // so parallel workers would race the counts rather than the code.
    {
      name: 'app12-s02-chromium',
      // Both S02 spec files: the checkout journeys and the `APP12-S02-C1`
      // pre-hydration safety cases. They share one world module and run
      // sequentially in the single worker this project uses.
      testMatch: '**/app12/s02-*.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP12-S03 — the secure Ready-Made order surface. The S02 topology plus an
    // Admin origin, because the customer's screen only moves when an operator
    // writes: the run drives the delivered Admin operations from a second real
    // session while the first watches the page.
    //
    // Serial and single-worker for the reason S02 is, doubled: each journey
    // creates real commercial history and the expiry journey runs the real
    // sweep, which claims from the whole queue — parallel workers would claim
    // each other's jobs.
    //
    // **`trace`, `video` and HAR are off, and that is a security control rather
    // than a performance one.** The first navigation of every journey carries
    // the raw `ORDER_ACCESS` token in the URL fragment; a trace or a video would
    // record it into an artifact that outlives the disposable database the rest
    // of the run is so careful to drop. Screenshots are taken only after the
    // fragment has been stripped, which each journey asserts before it takes one.
    {
      name: 'app12-s03-chromium',
      testMatch: '**/app12/s03-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: STOREFRONT_URL,
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    // APP12-A01 — Admin dynamic category management.
    //
    // Admin-only: the baseURL is the Admin origin and no Storefront page is
    // opened, because A01 changes no Storefront source. Serial and
    // single-worker, because every journey writes real taxonomy and audit
    // history into the one disposable database — parallel workers would race
    // each other for the same slugs, which are globally unique across every
    // lifecycle state.
    //
    // The viewport is 1440, the Admin desktop the frames are drawn at; the
    // 1024 case resizes within its own journey rather than duplicating the
    // project, because D01 introduces no second Admin breakpoint.
    {
      name: 'app12-a01-chromium',
      testMatch: '**/app12/a01-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
    // APP12-V02-C2 — media upload, processing and image delivery.
    //
    // The Admin origin, because the library is where the correction's subject
    // lives: the operator uploads there and the tile that showed a placeholder
    // is there. Serial within the file, and the whole project runs alone — the
    // stability sequence counts library tiles, so a second worker uploading
    // into the same account would move the number out from under it.
    //
    // The timeout is generous on purpose. Each of the six uploads posts real
    // bytes through the gateway and then waits for the real worker to inspect
    // the image and encode two derivatives; that is the chain under test, and
    // shortening the wait would only convert a slow machine into a false
    // failure.
    {
      name: 'app12-v02-c2-chromium',
      testMatch: '**/app12/v02-c2-*.acceptance.spec.ts',
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
    // APP12-M01.A1 — Admin product multi-image management.
    //
    // One project, three viewports. The 1440 default is where the approved
    // desktop frames were drawn; 1024 and 390 are reached by resizing inside the
    // journeys rather than by duplicating the project, because the *same*
    // operator session has to be shown at all three — the approved mobile
    // treatment is a different component, not a different run, and a second
    // project would prove only that two sessions render two pages.
    //
    // Serial and single-worker: every journey curates media on Products in one
    // shared fixture, and `expectedUpdatedAt` makes a second writer's save a
    // conflict — which is exactly what journey D asserts deliberately and what
    // parallel workers would inflict accidentally.
    //
    // The timeout is generous because the 20-image states load twenty real
    // derivative images through the gateway on every navigation.
    {
      name: 'app12-m01a1-chromium',
      testMatch: '**/app12/m01a1-*.acceptance.spec.ts',
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
    // APP12-A02-C1 — the Admin Ready-Made order branch.
    //
    // The Admin origin is the baseURL because the operator's screen is what is
    // under test; the customer's checkout runs in its own context on the
    // Storefront origin, which is how a real order gets made for the operator
    // to work on. 1440 is the project default and 1024 is asserted inside the
    // suite by resizing — the Admin is a desktop operator tool and D01 draws no
    // mobile design for it (`APP12-D01` §L).
    {
      name: 'app12-a02-chromium',
      testMatch: '**/app12/a02-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
    // APP12-H01 — the Wave-1 live security acceptance.
    //
    // Two projects, one topology. The Admin origin is the baseURL because the
    // authenticated operator screens are half the subject; the customer's secure
    // surface runs in its own context on the Storefront origin, which is how a
    // real ORDER_ACCESS grant gets exercised against a real order.
    //
    // Every secret-bearing artifact is off, for the reason `APP12-S03` records:
    // a trace, a HAR or a video of these journeys would capture a live
    // ORDER_ACCESS token in a request body and write it to disk. Screenshots are
    // off too — the journeys assert, they do not illustrate.
    {
      name: 'app12-h01-chromium',
      // Named files, not a prefix glob: `h01-wave2-scope` is the sibling project's
      // and must not run in a world where the custom capability is withheld.
      testMatch: [
        '**/app12/h01-admin-security.acceptance.spec.ts',
        '**/app12/h01-secure-security.acceptance.spec.ts',
        '**/app12/h01-grant-death.acceptance.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    // The same journeys' Wave-2 sibling: one file, run only with the custom
    // capability released, proving the two grant scopes cannot reach each
    // other's operations.
    {
      name: 'app12-h01-wave2-chromium',
      testMatch: '**/app12/h01-wave2-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: STOREFRONT_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    // APP12-H08 — the Wave-1 accessibility and compatibility gate.
    //
    // Four projects over one environment. The Chromium pair carries the full
    // audit (axe, keyboard journeys, contrast, reflow, target size); Firefox and
    // WebKit carry the §11 smoke, which is a different subject and deliberately
    // a smaller one — "no browser-specific operation failure", not a second
    // opinion on every rule.
    //
    // **Firefox and WebKit run on the host, not in the container.** Every other
    // project in this file says the non-Chromium engines cannot: they have no
    // `--host-resolver-rules`, which is a Chromium flag, so the comment at the
    // top of this file routed them to the Linux image. That reasoning is stale.
    // `docs/development/LOCAL_DEVELOPMENT.md` §4 makes the two gateway
    // hostnames a **required one-time hosts-file entry** for every developer of
    // this repository, and a hosts file resolves for every process on the
    // machine regardless of engine — which `APP12-H08` verified by opening
    // `http://embroidery.local` in both engines before writing this. The
    // container path stays available for `--full`; it is simply not needed
    // here, and needing it would have cost this gate the workspace access its
    // world module depends on (the image copies `specs` and nothing else).
    //
    // Artifacts are off for the reason `APP12-S03` and `APP12-H01` record: the
    // customer journeys open a live `ORDER_ACCESS` surface, and a trace, a video
    // or a HAR of one writes secret-bearing material to disk that outlives the
    // disposable database. Off unconditionally, so a *failure* cannot be the
    // thing that creates the artefact.
    {
      name: 'app12-h08-storefront-chromium',
      testMatch: '**/app12/h08-storefront-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: STOREFRONT_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    {
      name: 'app12-h08-admin-chromium',
      testMatch: '**/app12/h08-admin-*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: ADMIN_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    {
      name: 'app12-h08-firefox',
      testMatch: '**/app12/h08-compat.acceptance.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: STOREFRONT_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    {
      name: 'app12-h08-webkit',
      testMatch: '**/app12/h08-compat.acceptance.spec.ts',
      // WebKit runs the customer half only (§11: WebKit — customer critical
      // smoke). The Admin cases are grepped out rather than split into a second
      // file, so the two engines assert the *same* journey text and a
      // divergence between them cannot hide in two copies of it.
      grepInvert: /@admin/,
      use: {
        ...devices['Desktop Safari'],
        baseURL: STOREFRONT_URL,
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        video: 'off',
        screenshot: 'off',
      },
    },
    // APP12-V01 — the UI/UX live audit. Its four projects, and the reasoning,
    // viewport policy and security rules behind them, live in
    // `playwright.projects.v01.ts`: four more here would have carried this file
    // past the 400-line hard limit.
    ...app12V01Projects({
      storefrontUrl: STOREFRONT_URL,
      adminUrl: ADMIN_URL,
      chromiumLaunch,
    }),
    {
      name: 'app7-e01-chromium',
      testMatch: '**/app7/*.acceptance.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLaunch,
        baseURL: STOREFRONT_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
