#!/usr/bin/env node
/**
 * Canonical E2E entry point (APP0-T02B). Owns the whole lifecycle:
 *   provision disposable DB → start API + apps + real gateway → run Playwright
 *   → ALWAYS tear everything down in `finally` and verify nothing is left.
 *
 * Playwright's own web-server shutdown is deliberately not relied upon; this
 * wrapper owns every process/container/database and cleans up on success,
 * failure, and SIGINT/SIGTERM.
 *
 * Flags: --smoke (Chromium, host) | --full (all engines, Linux container)
 *        --headed --debug --runner=host|container
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  app4SecretEnv,
  createAdminCredentials,
  createApp4SecretConfig,
  createMerchantBankConfig,
  createRunId,
  loadE2EConfig,
  merchantBankEnv,
  objectStorageEnv,
} from '../support/orchestration/config.mjs';
import { startEnvironment } from '../support/orchestration/environment.mjs';
import { runContainer, runHost } from '../support/orchestration/playwright-runner.mjs';
import { isPortListening } from '../support/orchestration/net.mjs';

const SMOKE = ['storefront-chromium', 'admin-chromium'];
const FULL = [
  'storefront-chromium',
  'admin-chromium',
  'storefront-firefox',
  'admin-firefox',
  'storefront-webkit',
  'admin-webkit',
];
// APP1-E01 cross-layer acceptance projects. Host/Chromium only: the auth,
// session-mutation and responsive journeys need the host's disposable-database
// access and DevTools-driven checks, which the throwaway Linux container (only
// @playwright/test installed, no workspace) cannot provide.
const APP1 = ['app1-admin-chromium', 'app1-storefront-chromium'];
// APP4-E01-H02 helper readiness, host/Chromium for the same reason as APP1.
const APP4 = ['app4-storefront-chromium', 'app4-admin-chromium'];
// APP4-E01-R01 canonical acceptance — one serial project.
const APP4_R01 = ['app4-r01-chromium'];
// APP4-E01-R01-C1 — the targeted correction, run without the full R01 journey.
const APP4_R01_C1 = ['app4-r01-c1-chromium'];
// APP5-E01 — the custom-request cross-layer acceptance run. Same topology as the
// APP4 browser tier, plus this run's object storage for the in-process worker.
const APP5_E01 = ['app5-e01-chromium'];
// APP7-E01 — the deposit-payment cross-layer acceptance run. Same topology as
// the APP5 one (it needs the verification lane, the notification sink and this
// run's object storage) plus the merchant bank account `APP7-B03` fails fast
// without.
const APP7_E01 = ['app7-e01-chromium'];
// APP12-S01 — the Ready-Made purchase state. The leanest browser topology in the
// file: no Admin, no secret material, no object storage. It needs a disposable
// database carrying a test-only catalog, the real API, the real Storefront and
// the real gateway, and nothing else.
const APP12_S01 = ['app12-s01-chromium'];
// APP12-H06 — the Wave-1 SEO and public-readiness matrix. The S01 topology plus
// this run's object storage: the run has to fetch an `og:image` and a JSON-LD
// image to prove they are publicly retrievable (`APP12-H06` §10), which needs
// real bytes behind the delivery route rather than only the rows that address
// them. No Admin, no secret material beyond what `AppModule` refuses to start
// without, and no commercial write — every journey is an anonymous read.
const APP12_H06 = ['app12-h06-chromium'];
// APP12-S02 — the Ready-Made checkout. The S01 topology plus the APP4
// verification lane and the in-process worker, because the customer has to
// receive a real verification code before an order can be created at all. It is
// the first Storefront mode that writes commercial rows, so it runs only
// against the disposable database the orchestrator drops afterwards.
const APP12_S02 = ['app12-s02-chromium'];
// APP12-S03 — the secure Ready-Made order surface. The S02 topology plus an
// authenticated Admin session, because the customer's screen only moves when an
// operator writes: the run drives the delivered Admin operations from a second
// real session while the browser watches the page. It also needs this run's
// object storage, because the evidence journey uploads a real image.
const APP12_S03 = ['app12-s03-chromium'];
// APP12-A01 — Admin dynamic category management. The leanest Admin topology in
// the file: a disposable database, the real API, the real Admin and the real
// gateway. No Storefront process is started — A01 changes none of it — and no
// object storage, because a category has no media. It needs the staff-bootstrap
// Admin because every journey is an authenticated operator writing taxonomy.
const APP12_A01 = ['app12-a01-chromium'];
// APP12-M01.A1 — Admin product multi-image management. The A01 Admin topology
// plus this run's object storage, and that addition is the whole point: the
// subject is a grid of twenty **real photographs**, so the run needs real WebP
// derivatives behind the Admin preview route. Twenty neutral blocks would prove
// nothing about whether twenty images are legible at 157px. No Storefront
// process is started — `M01.S1` owns that surface and is not authorised here.
const APP12_M01A1 = ['app12-m01a1-chromium'];
const APP12_M01S1 = ['app12-m01s1-chromium'];
// APP12-N01.S01 — the email-only verification UX. The S02 topology exactly, and
// deliberately not a new one: the surface under test is the checkout's own
// verification card, so it needs the same catalog, the same APP4 lane and the
// same in-process worker. What differs is entirely inside the Playwright child
// — the spec composes that worker with a delivering SMTP transport aimed at a
// loopback capture listener it owns, because `S01` §18 forbids reading the code
// out of the recording adapter. Nothing in the orchestrated topology changes,
// which is why this rides `app12S02` everywhere below rather than duplicating
// twelve conditions.
const APP12_N01S1 = ['app12-n01s1-chromium'];
// APP12-N01.E01 — the same world as N01.S01 (same topology, same in-process
// worker, same loopback capture listener), running the cross-boundary content
// acceptance instead of the UX acceptance. It reuses the S01 mode string on
// purpose: E01 asks what the delivered message said, not what the world was, so
// forking the topology would only create a second thing to keep in step.
const APP12_N01E1 = ['app12-n01e1-chromium'];
// APP12-M01.E1 — the final cross-boundary acceptance world, and the first mode
// that starts the Admin **and** the Storefront over one catalog. That union is
// the whole point: §11 and §12 are claims about an operator's write reaching a
// visitor's page, and neither the A1 topology (no Storefront) nor the S1 one
// (no operator) can carry them. Three ordered projects rather than one, because
// the three surfaces have three different base origins and Playwright resolves
// `baseURL` per project; they run in declaration order under the config's
// single worker, and their datasets are disjoint by fixture prefix.
const APP12_M01E1 = [
  'app12-m01e1-domain-chromium',
  'app12-m01e1-admin-chromium',
  'app12-m01e1-cross-chromium',
  'app12-m01e1-sf-chromium',
];
// APP12-A02-C1 — the Admin Ready-Made order branch. The S03 topology exactly:
// a Storefront to place a **real** order through the real checkout, the APP4
// verification lane that order cannot exist without, an authenticated Admin,
// this run's object storage for the evidence journey, and the disposable
// database all of it writes to. The difference from S03 is only which screen is
// under test — there the customer's, here the operator's — so the environment
// is shared rather than duplicated.
const APP12_A02 = ['app12-a02-chromium'];
// APP12-H01 — the Wave-1 live security acceptance. The A02 topology exactly,
// because the security journeys need the same commercial universe: a real
// verified Ready-Made order to hold an ORDER_ACCESS grant, an authenticated
// operator to price it, this run’s object storage for the evidence lane, and
// the disposable database all of it writes to. Nothing is added to the
// topology; only the subject differs — there the screens, here what they
// refuse.
const APP12_H01 = ['app12-h01-chromium'];
// The same topology with the custom capability RELEASED, for the one journey
// that cannot be proved with it withheld: that a real REQUEST_ACCESS grant and
// a real ORDER_ACCESS grant cannot reach each other’s operations. It is a
// separate run rather than a second project because the release state is read
// once when the API composes its module graph, so one process cannot serve
// both.
const APP12_H01_WAVE2 = ['app12-h01-wave2-chromium'];
// APP12-H08 — the Wave-1 accessibility and compatibility gate. The A02/H01
// topology exactly, and for the same reason those two share it: the audit needs
// the *whole* commercial universe on screen — a real purchasable catalog, a real
// verified checkout, a real ORDER_ACCESS surface and a real authenticated
// operator working the same order — because an accessibility finding on a
// fixture-rendered page is a finding about the fixture.
//
// Four projects rather than one, and the split is the checkpoint's own §11
// matrix rather than a convenience: the customer audit and the operator audit
// run on different origins, and the two non-Chromium engines run a *smoke*
// (§11: "Do not test every route in every browser") rather than the full audit.
const APP12_H08 = [
  'app12-h08-storefront-chromium',
  'app12-h08-admin-chromium',
  'app12-h08-firefox',
  'app12-h08-webkit',
];
// APP12-V01 — the professional UI/UX live audit. The H08 topology plus the
// content-density fixture, because the subject is what a *populated* product
// looks like: a Discover grid with one card and an Admin table with one row are
// calm by accident, and a critique written from them would be a critique of the
// fixture. Four projects, split by origin and by what each one has to build —
// the public browsing surfaces need no order, the commerce audit places one, the
// Admin audit works it, and the Admin shell tour opens every operator route.
const APP12_V01 = [
  'app12-v01-public-chromium',
  'app12-v01-commerce-chromium',
  'app12-v01-admin-shell-chromium',
  'app12-v01-admin-order-chromium',
  'app12-v02-perf-chromium',
];

/**
 * `--app4` (APP4-E01-H01) is not a Playwright mode.
 *
 * It starts the lean APP4 topology — PostgreSQL, MinIO and the real API HTTP
 * process carrying this run's ephemeral APP4 secret material — and runs the H01
 * runtime smoke as a plain Node child. No browser tier is started because H01 is
 * forbidden from opening one; the browser projects arrive with `APP4-E01-H02`.
 */
async function runApp4Mode({ config, runId, log }) {
  const { createApp4SecretConfig, app4SecretEnv } =
    await import('../support/orchestration/config.mjs');
  const { startApp4Environment } = await import('../support/app4/app4-environment.mjs');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');

  const app4 = createApp4SecretConfig(runId);
  const smokePath = fileURLToPath(
    new URL('../support/app4/app4-runtime.smoke.mjs', import.meta.url),
  );
  let env;
  try {
    env = await startApp4Environment({ runId, config, app4, log });
    log(`api ready @ ${env.apiBaseUrl} — running H01 smoke`);
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [smokePath], {
        cwd: config.packageRoot,
        // The same universe the API process was started with — passed through
        // the child environment only, never an argument and never logged.
        env: {
          ...process.env,
          ...app4SecretEnv(app4),
          E2E_RUN_ID: runId,
          E2E_DATABASE_URL: env.database.url,
          E2E_APP4_API_BASE_URL: env.apiBaseUrl,
          E2E_APP4_CODE_PEPPER: app4.verificationCodePepper,
          E2E_APP4_LINK_PEPPER: app4.secureLinkTokenPepper,
          E2E_APP4_ENVELOPE_KEY: app4.notificationDeliveryEnvelopeKey,
          E2E_APP4_STOREFRONT_ORIGIN: app4.storefrontOrigin,
        },
        stdio: 'inherit',
        shell: false,
      });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    return exitCode;
  } finally {
    if (env !== undefined) {
      log('tearing down APP4 environment');
      await env.cleanup.run({ logger: log });
    }
  }
}

/**
 * `--app7-qr-scan` (APP7-E01-U01) is not a Playwright mode either.
 *
 * It prepares the single artifact the one human gate in `APP7-E01` §10 needs: a
 * real `publicOrderDeposit_qr` PNG encoding the **operator's real merchant
 * destination** and a **synthetic** order, deposit and reference. It opens no
 * browser, asserts no payment outcome and re-executes none of the six E01
 * cases.
 *
 * Nothing it prints is a value: presence and shape are booleans, and the only
 * string returned is the local, git-ignored file path.
 */
async function runApp7QrScanMode({ log }) {
  const { prepareQrForScan } = await import('../support/app7/app7-qr-scan-prepare.mjs');
  const result = await prepareQrForScan({ log });

  if (!result.ok && result.stage === 'MERCHANT_ENV') {
    log('APP7-E01-U01 = WAITING_FOR_OPERATOR_MERCHANT_ENV');
    log(`merchant env present    = ${String(result.inspection.present)}`);
    log(`merchant env shape valid = ${String(result.inspection.shapeValid)}`);
    if (result.inspection.missing.length > 0) {
      log(`MISSING_VARIABLES = ${result.inspection.missing.join(', ')}`);
    }
    if (result.inspection.reason !== undefined) {
      // The loader's refusal names the variable and never the value.
      log(`shape refusal = ${result.inspection.reason}`);
    }
    return 1;
  }
  if (!result.ok) {
    log(`APP7-E01-U01 = FAILED at ${result.stage}`);
    log(JSON.stringify({ ...result, ok: undefined }));
    return 1;
  }

  log('merchant env present     = true');
  log('merchant env shape valid = true');
  log(`QR HTTP                  = ${String(result.status)}`);
  log(`QR content type          = ${result.contentType}`);
  log(`QR PNG bytes             = ${String(result.byteLength)}`);
  log(`order is AWAITING_DEPOSIT = ${String(result.orderIsAwaitingDeposit)}`);
  log(`deposit is PENDING        = ${String(result.depositIsPending)}`);
  log(`QR PNG path              = ${result.pngPath}`);
  return 0;
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const runnerArg = argv.find((a) => a.startsWith('--runner='));
  const app1 = flags.has('--app1');
  // APP4-E01-H01: a non-Playwright mode, so it short-circuits before projects.
  const app4 = flags.has('--app4') && !flags.has('--app4-browser');
  // APP7-E01-U01: a non-Playwright mode; it short-circuits before projects.
  const app7QrScan = flags.has('--app7-qr-scan');
  // APP4-E01-R01: the canonical acceptance run — the same topology and env as
  // the H02 browser tier, a different project.
  const app4R01C1 = flags.has('--app4-r01-c1');
  const app4R01 = flags.has('--app4-r01') && !app4R01C1;
  // APP5-E01: the same topology and secret material as the APP4 browser tier —
  // it needs the real verification and notification lanes — so it rides the same
  // mode with its own project.
  const app5E01 = flags.has('--app5-e01');
  // APP7-E01: same topology and secret material as the APP5 run, one more
  // project and the merchant bank configuration.
  const app7E01 = flags.has('--app7-e01');
  // APP12-S01: a Playwright mode of its own, on the plain smoke topology plus a
  // seeded catalog and the Storefront's own runtime configuration.
  const app12S01 = flags.has('--app12-s01');
  // APP12-H06: the SEO matrix. Same family as S01, with object storage.
  const app12H06 = flags.has('--app12-h06');
  // APP12-S02: the same Playwright mode family, with the APP4 secret material
  // and the browser tier's in-process runtime the verification lane needs.
  // APP12-N01.S01: the email-only verification UX, on the S02 topology.
  const app12N01E1 = flags.has('--app12-n01e1');
  const app12N01S1 = flags.has('--app12-n01s1') || app12N01E1;
  const app12S02 = flags.has('--app12-s02') || app12N01S1;
  // APP12-S03: the same Playwright mode family as S02, plus the Admin origin and
  // this run's object storage.
  const app12S03 = flags.has('--app12-s03');
  // APP12-A01: the Admin-only Playwright mode. Same family, no Storefront.
  const app12A01 = flags.has('--app12-a01');
  // APP12-A02-C1: the Admin Ready-Made order branch. Rides the S03 topology.
  const app12A02 = flags.has('--app12-a02');
  // APP12-M01.A1: Admin product media management. The A01 topology plus storage.
  const app12M01A1 = flags.has('--app12-m01a1');
  // APP12-M01.S1: the Storefront gallery. The same storage topology as A1, but
  // the Storefront process instead of the Admin one — no operator ever logs in.
  const app12M01S1 = flags.has('--app12-m01s1');
  // APP12-M01.E1: the final cross-boundary acceptance world — the A1 Admin
  // topology and the S1 Storefront topology at once, over one catalog holding
  // all three fixtures.
  const app12M01E1 = flags.has('--app12-m01e1');
  // APP12-H08: the accessibility and compatibility gate, on the A02 topology.
  const app12H08 = flags.has('--app12-h08');
  // APP12-V01: the UI/UX live audit, on the H08 topology plus density content.
  const app12V01 = flags.has('--app12-v01');
  // APP12-H01: the live security acceptance, and its Wave-2-released sibling.
  const app12H01Wave2 = flags.has('--app12-h01-wave2');
  const app12H01 = flags.has('--app12-h01') || app12H01Wave2;
  // APP4-E01-H02: the browser tier, which IS a Playwright mode.
  const app4Browser = flags.has('--app4-browser') || app4R01 || app4R01C1 || app5E01 || app7E01;
  const full = flags.has('--full');
  const mode = app12M01E1
    ? 'app12-m01e1'
    : app12M01S1
      ? 'app12-m01s1'
      : app12M01A1
        ? 'app12-m01a1'
        : app12V01
          ? 'app12-v01'
          : app4
            ? 'app4'
            : app12H08
              ? 'app12-h08'
              : app12H06
                ? 'app12-h06'
                : app12H01Wave2
                  ? 'app12-h01-wave2'
                  : app12H01
                    ? 'app12-h01'
                    : app12A02
                      ? 'app12-a02'
                      : app12A01
                        ? 'app12-a01'
                        : app12S03
                          ? 'app12-s03'
                          : app12N01S1
                            ? 'app12-n01s1'
                            : app12S02
                              ? 'app12-s02'
                              : app12S01
                                ? 'app12-s01'
                                : app7E01
                                  ? 'app7-e01'
                                  : app5E01
                                    ? 'app5-e01'
                                    : app4Browser
                                      ? 'app4-browser'
                                      : app1
                                        ? 'app1'
                                        : full
                                          ? 'full'
                                          : 'smoke';
  const projects = app12M01E1
    ? APP12_M01E1
    : app12M01S1
      ? APP12_M01S1
      : app12M01A1
        ? APP12_M01A1
        : app12V01
          ? APP12_V01
          : app12H08
            ? APP12_H08
            : app12H06
              ? APP12_H06
              : app12H01Wave2
                ? APP12_H01_WAVE2
                : app12H01
                  ? APP12_H01
                  : app12A02
                    ? APP12_A02
                    : app12A01
                      ? APP12_A01
                      : app12S03
                        ? APP12_S03
                        : app12N01E1
                          ? APP12_N01E1
                          : app12N01S1
                            ? APP12_N01S1
                            : app12S02
                              ? APP12_S02
                              : app12S01
                                ? APP12_S01
                                : app7E01
                                  ? APP7_E01
                                  : app5E01
                                    ? APP5_E01
                                    : app4R01C1
                                      ? APP4_R01_C1
                                      : app4R01
                                        ? APP4_R01
                                        : app4Browser
                                          ? APP4
                                          : app1
                                            ? APP1
                                            : full
                                              ? FULL
                                              : SMOKE;
  // The E01 suite is always host/Chromium; it cannot run in the container.
  const runner =
    app1 ||
    app12M01A1 ||
    app12M01S1 ||
    app12M01E1 ||
    app4Browser ||
    app12S01 ||
    app12S02 ||
    app12S03 ||
    app12A02 ||
    app12A01 ||
    app12H01 ||
    app12H06 ||
    app12H08 ||
    app12V01
      ? 'host'
      : runnerArg
        ? runnerArg.split('=')[1]
        : full
          ? 'container'
          : 'host';
  const extraArgs = [];
  if (flags.has('--headed')) extraArgs.push('--headed');
  if (flags.has('--debug')) extraArgs.push('--debug');
  return {
    mode,
    projects,
    runner,
    extraArgs,
    app1,
    app4,
    app4Browser,
    app5E01,
    app7E01,
    app7QrScan,
    app12S01,
    app12S03,
    app12S02,
    app12A01,
    app12A02,
    app12H01,
    app12H01Wave2,
    app12H06,
    app12H08,
    app12V01,
    app12M01A1,
    app12M01S1,
    app12M01E1,
  };
}

function log(message) {
  process.stdout.write(`[e2e] ${message}\n`);
}

async function verifyClean(config) {
  const stragglers = [];
  for (const [label, port] of Object.entries(config.ports)) {
    if (await isPortListening(port)) {
      stragglers.push(`${label} (port ${port})`);
    }
  }
  return stragglers;
}

async function main() {
  const {
    mode,
    projects,
    runner,
    extraArgs,
    app1,
    app4,
    app4Browser,
    app5E01,
    app7E01,
    app7QrScan,
    app12S01,
    app12S02,
    app12S03,
    app12A01,
    app12A02,
    app12H01,
    app12H01Wave2,
    app12H06,
    app12H08,
    app12V01,
    app12M01A1,
    app12M01S1,
    app12M01E1,
  } = parseArgs(process.argv.slice(2));

  // APP7-E01-U01 owns its own lean topology and teardown and starts no browser
  // tier, so it returns before any hostname, project or Playwright machinery.
  if (app7QrScan) {
    log('mode=app7-qr-scan (APP7-E01-U01 manual-scan preparation)');
    process.exit(await runApp7QrScanMode({ log }));
  }
  // APP5-E01 runs on `*.localhost` hostnames instead of `*.embroidery.local`.
  //
  // Not cosmetic: Chrome attaches `Sec-Fetch-*` only to *potentially
  // trustworthy* URLs, and `APP3-B07` refuses a Design Session mutation that
  // carries no `Sec-Fetch-Site` (IMP-D043 PO-05). On `http://embroidery.local`
  // the browser sends none, so the catalog branch — which submits a session —
  // is unreachable there, while in production (HTTPS) it is ordinary. `.localhost`
  // is in the browser's loopback trustworthy set, so it stands in for the
  // production origin without terminating TLS in the harness. `localhost` itself
  // is deliberately not used: the orchestrator probes the gateway's own health
  // on `http://localhost:<port>`, which must keep reaching the default server.
  if (app5E01 || app7E01) {
    process.env['STOREFRONT_HOST'] = process.env['STOREFRONT_HOST'] ?? 'embroidery.localhost';
    process.env['ADMIN_HOST'] = process.env['ADMIN_HOST'] ?? 'admin.embroidery.localhost';
  }
  const config = loadE2EConfig();
  const runId = createRunId();

  // APP4-E01-H01 owns its own lean topology and teardown, and starts no browser
  // tier, so it returns before any Playwright/project machinery below.
  if (app4) {
    log(`run ${runId} — mode=app4 (E01 runtime harness smoke)`);
    process.exit(await runApp4Mode({ config, runId, log }));
  }
  // The APP4-E01-H02 browser tier needs the same real bootstrap Admin the APP1
  // journeys use: its A01 readiness check logs in through the real form, and no
  // guard may be bypassed with an injected cookie.
  //
  // `APP12-S02` needs it for a different reason and opens no Admin surface at
  // all. The staff-bootstrap CLI is the **canonical publisher of the APP4
  // policy configurations** (`PublishApp4PolicyUseCase`, called from
  // `staff-bootstrap.ts`), and `verification.challenge` is one of them. Without
  // it the disposable database carries migrations and no policy rows, so
  // `POST /api/public/verification/challenges` answers `503 — not configured to
  // issue`, which the Storefront correctly renders as the approved back-off
  // state. A checkout cannot be created without a verified challenge, so the
  // run needs the policies, and the accepted way to get them is to run the CLI
  // rather than to insert policy rows behind it. The Admin account it creates
  // is a by-product; nothing in the S02 suite logs in.
  const adminCredentials =
    app1 ||
    app4Browser ||
    app12S02 ||
    app12S03 ||
    app12A01 ||
    app12A02 ||
    app12H01 ||
    app12H08 ||
    app12V01 ||
    app12M01A1 ||
    app12M01E1
      ? createAdminCredentials(runId)
      : undefined;
  // The browser tier overrides one non-secret value: the canonical origin the
  // API renders secure links against. The generated default is an unresolvable
  // `.invalid` host — correct for the lean H01 mode, which never opens a
  // browser, but `APP4-E01-R01` has to *navigate* the delivered link, so here it
  // must be this run's real gateway origin. Still a per-run test value; IMP-D050
  // is untouched.
  //
  // `APP12-S01` needs the same material for a different reason: it opens no APP3
  // or APP4 surface at all, but `AppModule` cannot be *constructed* without the
  // Design Session pepper — anonymous Session secrets are verified with a
  // peppered HMAC that has no unpeppered fallback — so the API would refuse to
  // start and the failure would read as an S01 defect. Per-run, synthetic and
  // in-memory, exactly as above.
  //
  // `APP12-S02` needs it for the original reason as well as S01's: a Ready-Made
  // order cannot be created without a **verified SUBMISSION challenge**, so the
  // run has to issue real verification codes and read them back through the
  // recording adapter — which only works if the browser tier's in-process
  // contexts share the one pepper set and envelope key the API HTTP process was
  // started with.
  //
  // `APP12-A01` needs it for S01's reason alone: it opens no APP3 or APP4
  // surface, but `AppModule` cannot be *constructed* without the Design Session
  // pepper, so the API would refuse to start and the failure would read as an
  // A01 defect. Per-run, synthetic and in-memory.
  const app4Secrets =
    app4Browser ||
    app12S01 ||
    app12S02 ||
    app12S03 ||
    app12A02 ||
    app12A01 ||
    app12H01 ||
    app12H06 ||
    app12H08 ||
    app12V01 ||
    app12M01A1 ||
    app12M01S1 ||
    app12M01E1
      ? { ...createApp4SecretConfig(runId), storefrontOrigin: config.baseUrls.storefront }
      : undefined;
  // `APP7-B03`'s merchant bank configuration is a module-scoped fail-fast
  // provider, so a graph containing `CustomerDepositModule` cannot be composed
  // without all four values. Every run that boots the real `AppModule` — the
  // API HTTP process, and the browser tier's in-process contexts — therefore
  // needs them, not only the APP7 mode. Synthetic and non-secret; see
  // `createMerchantBankConfig`.
  const merchant = createMerchantBankConfig();
  log(`run ${runId} — mode=${mode} runner=${runner} projects=${projects.length}`);

  let env;
  let cleaned = false;
  const cleanupOnce = async () => {
    if (cleaned || !env) {
      return;
    }
    cleaned = true;
    log('tearing down environment');
    const failures = await env.cleanup.run({ logger: log });
    const stragglers = await verifyClean(config);
    if (stragglers.length > 0) {
      log(`WARNING: resources still present after cleanup: ${stragglers.join(', ')}`);
    } else {
      log('cleanup verified: all E2E ports closed, disposable database dropped');
    }
    if (failures.length > 0) {
      log(`WARNING: ${failures.length} cleanup step(s) reported errors`);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanupOnce()
        .catch(() => {})
        .finally(() => process.exit(130));
    });
  }

  let exitCode;
  try {
    env = await startEnvironment({
      runId,
      config,
      log,
      withAdmin: adminCredentials,
      withMerchantBank: merchantBankEnv(merchant),
      // The API's own half of the release decision (APP12-H01). The route gate
      // and the operation gate are two enforcement points of one state, so a run
      // that released the Storefront routes while the API withheld the
      // operations would prove nothing about either. Only the H01 modes state
      // it; every other mode leaves the API on its canonical withheld default.
      ...(app12H01
        ? { withApi: { CUSTOM_EMBROIDERY_RELEASE_ENABLED: app12H01Wave2 ? 'true' : 'false' } }
        : {}),
      // APP12-S01: the Storefront renders the Ready-Made purchase state on the
      // server, so this is the first mode that has to configure that process at
      // all. Wave 2 is explicitly withheld — the purchase journeys are Wave-1
      // surfaces and must be proved with the custom capability off.
      //
      // `--app12-h01-wave2` is the one exception, and it is a security journey
      // rather than a commerce one: `APP12-H01` has to prove that a **real**
      // REQUEST_ACCESS grant and a **real** ORDER_ACCESS grant cannot reach each
      // other's operations, and neither grant can exist unless the capability
      // that mints it is released. The API reads the same value below, because a
      // released route in front of a withheld operation would prove nothing.
      ...(app12S01 ||
      app12S02 ||
      app12S03 ||
      app12A02 ||
      app12H01 ||
      app12H06 ||
      app12H08 ||
      app12V01 ||
      app12M01S1 ||
      app12M01E1
        ? {
            withStorefront: {
              INTERNAL_API_BASE_URL: `http://localhost:${config.ports.api}/api`,
              STOREFRONT_PUBLIC_ORIGIN: config.baseUrls.storefront,
              CUSTOM_EMBROIDERY_RELEASE_ENABLED: app12H01Wave2 ? 'true' : 'false',
            },
          }
        : {}),
      // The APP4/APP5/APP7 browser tiers configure the Storefront process too,
      // and until now did not — they predate `STOREFRONT_PUBLIC_ORIGIN` becoming
      // required (`IMP-D050`), so their Storefront started without it and every
      // route it renders answered 500 in a browser. `APP12-G02-C1` recorded that
      // an unset origin is invisible to curl and fatal to a page; the H02 smoke
      // has been failing on exactly that, at HEAD, on `/xac-minh-lien-he`.
      //
      // Deliberately **not** the Wave-2 release flag. Those modes drive the
      // custom-request and deposit journeys, which need the Storefront's own
      // default rather than a value this line would decide for them.
      ...(app4Browser
        ? {
            withStorefront: {
              INTERNAL_API_BASE_URL: `http://localhost:${config.ports.api}/api`,
              STOREFRONT_PUBLIC_ORIGIN: config.baseUrls.storefront,
            },
          }
        : {}),
      ...(app4Secrets === undefined
        ? {}
        : {
            withApp4: {
              ...app4SecretEnv(app4Secrets),
              // APP5-E01 only, and not secret: `APP3-B07` refuses a session
              // mutation whose `Origin` is not in this allowlist, and the E2E
              // API process was never given one — so no run before this one
              // could open a Design Session at all. The value is this run's own
              // gateway origin, the same shape `docker-compose.dev.yml` sets.
              ...(app5E01 || app7E01
                ? {
                    DESIGN_SESSION_ALLOWED_ORIGINS: config.baseUrls.storefront,
                    // The Session cookie is `__Host-` prefixed (IMP-D043 PO-03),
                    // and every browser rejects a `__Host-` cookie that is not
                    // `Secure`. `NODE_ENV=test` would otherwise default this to
                    // false and the cookie would be silently dropped, so the
                    // catalog branch would be unauthorized for a reason that has
                    // nothing to do with APP5. The `.localhost` origin above is
                    // trustworthy, so a Secure cookie is both accepted and sent
                    // — the same configuration production runs.
                    DESIGN_SESSION_COOKIE_SECURE: 'true',
                  }
                : {}),
            },
          }),
    });
    log(
      `environment ready — storefront ${config.baseUrls.storefront} admin ${config.baseUrls.admin}`,
    );

    // APP12-S01: the test-only catalog, written into THIS run's disposable
    // database and dropped with it. Seeded after the environment is up so a
    // failure to start never leaves a half-written fixture, and after the API is
    // listening so the first page view reads a complete catalog.
    let app12S01Fixture;
    if (app12S01) {
      const { seedS01Catalog } = await import('../support/app12/s01-catalog-fixture.mjs');
      app12S01Fixture = await seedS01Catalog({ databaseUrl: env.database.url, log });
    }
    // APP12-H06: the SEO matrix — indexable and non-indexable categories, the
    // three offer shapes, the publication edges, and real image bytes so an
    // `og:image` can actually be fetched. Written into THIS run's disposable
    // database and dropped with it; the seeder refuses any other.
    //
    // `sharp` is resolved from `apps/worker`, which is the workspace that owns
    // it. The e2e package does not depend on it and should not: nothing in the
    // browser tier processes an image, and adding a native dependency to a test
    // harness so one fixture can write two WebPs would be the wrong trade.
    let app12H06Fixture;
    if (app12H06) {
      const { seedH06SeoFixture } = await import('../support/app12/h06-seo-fixture.mjs');
      // Two owners, resolved from the workspace that actually declares each:
      // `sharp` from `apps/worker` (the image pipeline) and the S3 client from
      // `packages/object-storage` (the storage adapter). Reaching for either
      // through the e2e package's own resolution would depend on a hoist that
      // pnpm's isolated node_modules deliberately does not provide.
      const workerRequire = createRequire(join(config.repoRoot, 'apps/worker/package.json'));
      const storageRequire = createRequire(
        join(config.repoRoot, 'packages/object-storage/package.json'),
      );
      const sharp = workerRequire('sharp');
      const { S3Client, PutObjectCommand } = storageRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: config.storage.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
      });
      app12H06Fixture = await seedH06SeoFixture({
        databaseUrl: env.database.url,
        sharp,
        putObject: async ({ storageKey, body, contentType }) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: config.storage.derivativesBucket,
              Key: storageKey,
              Body: body,
              ContentType: contentType,
            }),
          );
        },
        log,
      });
    }
    // APP12-S02: the same arrangement, and the same reasoning, for the checkout
    // catalog. The seeder refuses any database that is not `embroidery_db7_*`,
    // which is what keeps the run's **commercial** rows — orders, reservations,
    // grants — off the shared development stack (`APP12-S02` §43, §44).
    // APP12-S03 rides the same seeder, deliberately. It needs one purchasable
    // Product with stock, which is exactly what the S02 catalog already is, and
    // a second near-identical fixture would be duplication with no acceptance
    // value. The rows keep their `app12-s02-e2e` prefix, which is accurate: they
    // *are* the S02 fixture, borrowed.
    // APP12-A01: the archive-refusal journey needs a PUBLISHED category that
    // already holds PUBLISHED products, and the S01 catalog is exactly that —
    // one test-only category with two published Products under it. Borrowing it
    // is deliberate: a second near-identical fixture would be duplication with
    // no acceptance value, and the rows keep their `app12-s01-e2e` prefix,
    // which stays accurate. Every category A01 *authors* is created through the
    // real screen, so the fixture supplies the dependency and nothing else.
    let app12A01Fixture;
    if (app12A01) {
      const { seedS01Catalog } = await import('../support/app12/s01-catalog-fixture.mjs');
      app12A01Fixture = await seedS01Catalog({ databaseUrl: env.database.url, log });
    }
    // APP12-M01.A1: five test-only Products carrying real, processed catalog
    // media — 8 and 20 images on DRAFT, 3 and 1 on PUBLISHED, and a two-image
    // published Product whose second Asset journey E revokes mid-session.
    //
    // Real WebP derivatives, not placeholders: the subject is whether twenty
    // photographs remain legible and operable in a grid, which a neutral block
    // cannot answer. `sharp` and the S3 client are resolved from the workspaces
    // that declare them, exactly as the H06 and V01 modes do and for the reason
    // recorded there — pnpm's isolated node_modules provides no hoist, and a
    // native image dependency does not belong in a test harness.
    let app12M01A1Fixture;
    if (app12M01A1 || app12M01E1) {
      const { seedM01A1Media } = await import('../support/app12/m01a1-media-fixture.mjs');
      const workerRequire = createRequire(join(config.repoRoot, 'apps/worker/package.json'));
      const storageRequire = createRequire(
        join(config.repoRoot, 'packages/object-storage/package.json'),
      );
      const sharp = workerRequire('sharp');
      const { S3Client, PutObjectCommand } = storageRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: config.storage.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
      });
      app12M01A1Fixture = await seedM01A1Media({
        databaseUrl: env.database.url,
        sharp,
        putObject: async ({ storageKey, body, contentType }) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: config.storage.derivativesBucket,
              Key: storageKey,
              Body: body,
              ContentType: contentType,
            }),
          );
        },
        log,
      });
    }
    // APP12-M01.S1: three PUBLISHED Products at one, eight and twenty real
    // images, written into THIS run's disposable database and dropped with it.
    // `sharp` and the S3 client are resolved from the workspaces that declare
    // them, exactly as the H06, V01 and M01.A1 modes do and for the reason
    // recorded there — pnpm's isolated node_modules provides no hoist.
    let app12M01S1Fixture;
    if (app12M01S1 || app12M01E1) {
      const { seedM01S1Gallery } = await import('../support/app12/m01s1-gallery-fixture.mjs');
      const workerRequire = createRequire(join(config.repoRoot, 'apps/worker/package.json'));
      const storageRequire = createRequire(
        join(config.repoRoot, 'packages/object-storage/package.json'),
      );
      const sharp = workerRequire('sharp');
      const { S3Client, PutObjectCommand } = storageRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: config.storage.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
      });
      app12M01S1Fixture = await seedM01S1Gallery({
        databaseUrl: env.database.url,
        sharp,
        putObject: async ({ storageKey, body, contentType }) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: config.storage.derivativesBucket,
              Key: storageKey,
              Body: body,
              ContentType: contentType,
            }),
          );
        },
        log,
      });
    }
    // APP12-M01.E1: the two PUBLISHED Products the A1 and S1 fixtures do not
    // hold — the stored-primary propagation subject and the degradation one.
    // Seeded third so the whole M01 catalog exists in one database; the three
    // fixtures use disjoint slug prefixes and share no Asset.
    let app12M01E1Fixture;
    if (app12M01E1) {
      const { seedM01E1Acceptance } = await import('../support/app12/m01e1-acceptance-fixture.mjs');
      const workerRequire = createRequire(join(config.repoRoot, 'apps/worker/package.json'));
      const storageRequire = createRequire(
        join(config.repoRoot, 'packages/object-storage/package.json'),
      );
      const sharp = workerRequire('sharp');
      const { S3Client, PutObjectCommand } = storageRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: config.storage.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
      });
      app12M01E1Fixture = await seedM01E1Acceptance({
        databaseUrl: env.database.url,
        sharp,
        putObject: async ({ storageKey, body, contentType }) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: config.storage.derivativesBucket,
              Key: storageKey,
              Body: body,
              ContentType: contentType,
            }),
          );
        },
        log,
      });
    }
    let app12S02Fixture;
    if (app12S02 || app12S03 || app12A02 || app12H01 || app12H08 || app12V01) {
      const { seedS02Catalog } = await import('../support/app12/s02-checkout-fixture.mjs');
      app12S02Fixture = await seedS02Catalog({ databaseUrl: env.database.url, log });
    }
    // APP12-V01: the content-density layer, on top of the S02 catalog the
    // commerce journeys need. Seeded second and deliberately so — it renames the
    // two S02 fixture rows into the shop content they stand in for, which it can
    // only do once they exist. `sharp` and the S3 client are resolved from the
    // workspaces that declare them, exactly as the H06 mode does and for the
    // reason recorded there: pnpm's isolated `node_modules` provides no hoist,
    // and adding a native image dependency to a test harness would be the wrong
    // trade.
    let app12V01Fixture;
    if (app12V01) {
      const { seedV01Density } = await import('../support/app12/v01-density-fixture.mjs');
      const workerRequire = createRequire(join(config.repoRoot, 'apps/worker/package.json'));
      const storageRequire = createRequire(
        join(config.repoRoot, 'packages/object-storage/package.json'),
      );
      const sharp = workerRequire('sharp');
      const { S3Client, PutObjectCommand } = storageRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: config.storage.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
      });
      app12V01Fixture = await seedV01Density({
        databaseUrl: env.database.url,
        sharp,
        putObject: async ({ storageKey, body, contentType }) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: config.storage.derivativesBucket,
              Key: storageKey,
              Body: body,
              ContentType: contentType,
            }),
          );
        },
        log,
      });
    }
    // E01 specs need the bootstrap Admin credentials and the disposable database
    // URL (for the session-mutation seam); passed only through the child env.
    const browserEnv =
      app1 || app4Browser
        ? {
            E2E_ADMIN_EMAIL: adminCredentials.email,
            E2E_ADMIN_PASSWORD: adminCredentials.password,
            E2E_ADMIN_DISPLAY_NAME: adminCredentials.displayName,
            E2E_DATABASE_URL: env.database.url,
            // Loopback control seam for the API-unavailability journey (J02).
            E2E_API_CONTROL_URL: env.apiControlUrl,
            // APP4-E01-H02: the run's universe, so the spec's evidence and
            // worker helpers join the same database and secret material the API
            // HTTP process was started with. Child environment only.
            ...(app4Secrets === undefined
              ? {}
              : {
                  E2E_RUN_ID: runId,
                  // R01 composes the real issuer from the API's compiled dist.
                  E2E_REPO_ROOT: config.repoRoot,
                  ...app4SecretEnv(app4Secrets),
                }),
            // APP5-E01 only: the in-process worker context inspects a real
            // customer upload, so it must read this run's MinIO rather than the
            // runtime's unresolvable offline default. The APP4 runs never fetch
            // an object and are left on that default deliberately.
            ...(app5E01 || app7E01 ? objectStorageEnv(config.storage) : {}),
            // APP7-E01: the in-process `AppModule` context composes the deposit
            // module, so it needs the same four merchant values the API HTTP
            // process was started with — and the spec asserts the customer's
            // screen against them, which is only meaningful if both halves of
            // the topology were configured identically.
            ...merchantBankEnv(merchant),
          }
        : app12H06
          ? {
              // The seeded slugs, so the spec asserts against what this run
              // actually created rather than against literals that would rot the
              // moment the fixture changed. Child environment only, and every
              // one of them is a public catalog slug — nothing secret travels
              // here, which is why this mode needs no redaction.
              E2E_APP12_H06_INDEXABLE_CATEGORY: app12H06Fixture.indexableCategorySlug,
              E2E_APP12_H06_NONINDEXABLE_CATEGORY: app12H06Fixture.nonIndexableCategorySlug,
              E2E_APP12_H06_AGGREGATE_PRODUCT: app12H06Fixture.aggregateProductSlug,
              E2E_APP12_H06_SINGLE_OFFER_PRODUCT: app12H06Fixture.singleOfferProductSlug,
              E2E_APP12_H06_NO_OFFER_PRODUCT: app12H06Fixture.noOfferProductSlug,
              E2E_APP12_H06_NOINDEX_PRODUCT: app12H06Fixture.noindexProductSlug,
              E2E_APP12_H06_IN_NOINDEX_CATEGORY_PRODUCT:
                app12H06Fixture.inNoindexCategoryProductSlug,
              E2E_APP12_H06_DRAFT_PRODUCT: app12H06Fixture.draftProductSlug,
              E2E_APP12_H06_ARCHIVED_PRODUCT: app12H06Fixture.archivedProductSlug,
              E2E_APP12_H06_GALLERY: app12H06Fixture.gallerySlug,
              E2E_APP12_H06_NOINDEX_GALLERY: app12H06Fixture.noindexGallerySlug,
              E2E_APP12_H06_UNKNOWN_SLUG: app12H06Fixture.unknownSlug,
              E2E_BASE_STOREFRONT: config.baseUrls.storefront,
            }
          : app12S01
            ? {
                // The seeded slugs, so the spec asserts against what this run
                // actually created rather than against a literal that would rot
                // the moment the fixture changed. Child environment only.
                E2E_APP12_S01_PURCHASABLE_SLUG: app12S01Fixture.purchasableSlug,
                E2E_APP12_S01_UNBUYABLE_SLUG: app12S01Fixture.unbuyableSlug,
                E2E_APP12_S01_CATEGORY_SLUG: app12S01Fixture.categorySlug,
              }
            : app12M01E1
              ? {
                  // The whole M01 catalog this run seeded, so every journey
                  // asserts against what actually exists rather than against
                  // literals that would rot the moment a fixture changed.
                  //
                  // Three fixtures, three prefixes: the Admin journeys read the
                  // A1 Products, the Storefront journeys read the S1 ones, and
                  // the cross-boundary journeys read the two E1 Products that
                  // exist for no other purpose.
                  E2E_APP12_M01A1_DRAFT0: app12M01A1Fixture.draft0.productId,
                  E2E_APP12_M01A1_DRAFT8: app12M01A1Fixture.draft8.productId,
                  E2E_APP12_M01A1_DRAFT20: app12M01A1Fixture.draft20.productId,
                  E2E_APP12_M01A1_PUBLISHED: app12M01A1Fixture.published.productId,
                  E2E_APP12_M01A1_PUBLISHED_SINGLE: app12M01A1Fixture.publishedSingle.productId,
                  E2E_APP12_M01A1_PUBLISHED_RACE: app12M01A1Fixture.publishedRace.productId,
                  E2E_APP12_M01A1_REVOCABLE_ASSET: app12M01A1Fixture.publishedRace.revocableAssetId,
                  E2E_APP12_M01A1_FREE_ASSETS: app12M01A1Fixture.freeAssetIds.join(','),
                  E2E_APP12_M01S1_ONE: app12M01S1Fixture.oneSlug,
                  E2E_APP12_M01S1_EIGHT: app12M01S1Fixture.eightSlug,
                  E2E_APP12_M01S1_TWENTY: app12M01S1Fixture.twentySlug,
                  E2E_APP12_M01S1_CATEGORY: app12M01S1Fixture.categorySlug,
                  E2E_APP12_M01E1_CATEGORY: app12M01E1Fixture.categorySlug,
                  E2E_APP12_M01E1_PROPAGATE_ID: app12M01E1Fixture.propagate.productId,
                  E2E_APP12_M01E1_PROPAGATE_SLUG: app12M01E1Fixture.propagate.slug,
                  E2E_APP12_M01E1_PROPAGATE_ASSETS: app12M01E1Fixture.propagate.assetIds.join(','),
                  E2E_APP12_M01E1_DEGRADE_ID: app12M01E1Fixture.degrade.productId,
                  E2E_APP12_M01E1_DEGRADE_SLUG: app12M01E1Fixture.degrade.slug,
                  E2E_APP12_M01E1_DEGRADE_ASSETS: app12M01E1Fixture.degrade.assetIds.join(','),
                  E2E_APP12_M01E1_STORED_PRIMARY: app12M01E1Fixture.degrade.storedPrimaryAssetId,
                  E2E_APP12_M01E1_DOMAIN_ID: app12M01E1Fixture.domain.productId,
                  E2E_APP12_M01E1_DOMAIN_SLUG: app12M01E1Fixture.domain.slug,
                  E2E_APP12_M01E1_DOMAIN_POOL: app12M01E1Fixture.domain.poolAssetIds.join(','),
                  E2E_APP12_M01E1_PUBLISHED_ID: app12M01E1Fixture.published.productId,
                  E2E_APP12_M01E1_PUBLISHED_SLUG: app12M01E1Fixture.published.slug,
                  E2E_APP12_M01E1_PUBLISHED_ASSETS: app12M01E1Fixture.published.assetIds.join(','),
                  E2E_APP12_M01E1_REFUSAL_ID: app12M01E1Fixture.refusal.productId,
                  E2E_APP12_M01E1_REFUSAL_SLUG: app12M01E1Fixture.refusal.slug,
                  E2E_APP12_M01E1_REFUSAL_ASSETS: app12M01E1Fixture.refusal.assetIds.join(','),
                  E2E_APP12_M01E1_REFUSAL_REVOCABLE: app12M01E1Fixture.refusal.revocableAssetId,
                  E2E_APP12_M01E1_SIGNAL_ID: app12M01E1Fixture.signal.productId,
                  E2E_APP12_M01E1_SIGNAL_SLUG: app12M01E1Fixture.signal.slug,
                  E2E_APP12_M01E1_SIGNAL_ASSETS: app12M01E1Fixture.signal.assetIds.join(','),
                  E2E_APP12_M01E1_SIGNAL_PRIMARY: app12M01E1Fixture.signal.storedPrimaryAssetId,
                  // §12 makes an Asset ineligible and restores it, and §7 reads
                  // stored rows back; no application path does either, so the
                  // specs write and read this run's disposable database.
                  E2E_DATABASE_URL: env.database.url,
                  // Where the visual evidence lands, resolved from the repository
                  // root rather than from the spec's own cwd.
                  E2E_REPO_ROOT: config.repoRoot,
                  E2E_RUN_ID: runId,
                  E2E_BASE_ADMIN: config.baseUrls.admin,
                  E2E_BASE_STOREFRONT: config.baseUrls.storefront,
                  E2E_ADMIN_EMAIL: adminCredentials.email,
                  E2E_ADMIN_PASSWORD: adminCredentials.password,
                }
              : app12M01S1
                ? {
                    // The seeded slugs, so every journey asserts against what this
                    // run actually created rather than against a literal that would
                    // rot the moment the fixture changed.
                    E2E_APP12_M01S1_ONE: app12M01S1Fixture.oneSlug,
                    E2E_APP12_M01S1_EIGHT: app12M01S1Fixture.eightSlug,
                    E2E_APP12_M01S1_TWENTY: app12M01S1Fixture.twentySlug,
                    E2E_APP12_M01S1_CATEGORY: app12M01S1Fixture.categorySlug,
                    // Where the visual evidence lands, resolved from the repository
                    // root rather than from the spec's own cwd.
                    E2E_REPO_ROOT: config.repoRoot,
                    E2E_RUN_ID: runId,
                    E2E_BASE_STOREFRONT: config.baseUrls.storefront,
                  }
                : app12M01A1
                  ? {
                      // The seeded Product ids and slugs, so every journey asserts
                      // against what this run actually created rather than against a
                      // literal that would rot the moment the fixture changed.
                      E2E_APP12_M01A1_DRAFT0: app12M01A1Fixture.draft0.productId,
                      E2E_APP12_M01A1_DRAFT8: app12M01A1Fixture.draft8.productId,
                      E2E_APP12_M01A1_DRAFT20: app12M01A1Fixture.draft20.productId,
                      E2E_APP12_M01A1_PUBLISHED: app12M01A1Fixture.published.productId,
                      E2E_APP12_M01A1_PUBLISHED_SINGLE: app12M01A1Fixture.publishedSingle.productId,
                      E2E_APP12_M01A1_PUBLISHED_RACE: app12M01A1Fixture.publishedRace.productId,
                      E2E_APP12_M01A1_REVOCABLE_ASSET:
                        app12M01A1Fixture.publishedRace.revocableAssetId,
                      // Journey E makes an Asset unavailable between staging and
                      // saving; no application path produces that on demand, so the
                      // spec writes it into this run's disposable database.
                      E2E_DATABASE_URL: env.database.url,
                      // Where the visual evidence lands, resolved from the repository
                      // root rather than from the spec's own cwd.
                      E2E_REPO_ROOT: config.repoRoot,
                      E2E_RUN_ID: runId,
                      E2E_BASE_ADMIN: config.baseUrls.admin,
                      E2E_ADMIN_EMAIL: adminCredentials.email,
                      E2E_ADMIN_PASSWORD: adminCredentials.password,
                    }
                  : app12A01
                    ? {
                        // The seeded dependency category, so the refusal journey asserts
                        // against what this run actually created. The Admin origin and
                        // credentials, because every A01 journey is an authenticated
                        // operator writing taxonomy — logged in through the real form.
                        // The password travels the child environment only.
                        E2E_APP12_A01_DEPENDENCY_CATEGORY_SLUG: app12A01Fixture.categorySlug,
                        E2E_RUN_ID: runId,
                        E2E_BASE_ADMIN: config.baseUrls.admin,
                        E2E_ADMIN_EMAIL: adminCredentials.email,
                        E2E_ADMIN_PASSWORD: adminCredentials.password,
                      }
                    : app12S02 || app12S03 || app12A02 || app12H01 || app12H08 || app12V01
                      ? {
                          // The seeded slugs and SKU ids, for the same reason. The SKU ids
                          // matter more here than in S01: the spec composes checkout
                          // addresses from them exactly as `APP12-S01`'s panel does, so a
                          // literal would be asserting against a URL nobody could reach.
                          E2E_APP12_S02_PRODUCT_SLUG: app12S02Fixture.productSlug,
                          E2E_APP12_S02_MAIN_SKU: app12S02Fixture.mainSkuId,
                          E2E_APP12_S02_SCARCE_SKU: app12S02Fixture.scarceSkuId,
                          E2E_APP12_S02_AMBIGUOUS_SKU: app12S02Fixture.ambiguousSkuIds[0],
                          // The run's universe, so the spec's in-process API and worker
                          // contexts join the same database and secret material the API
                          // HTTP process was started with — which is what lets it read a
                          // real verification code. Child environment only.
                          E2E_RUN_ID: runId,
                          E2E_REPO_ROOT: config.repoRoot,
                          E2E_DATABASE_URL: env.database.url,
                          // Which `evidences/<dir>` this run writes into. `APP12-V02` §35
                          // re-runs the V01 harness for the after-state and must not
                          // overwrite the before-state it is being compared against.
                          ...(process.env['E2E_EVIDENCE_DIR'] === undefined
                            ? {}
                            : { E2E_EVIDENCE_DIR: process.env['E2E_EVIDENCE_DIR'] }),
                          ...app4SecretEnv(app4Secrets),
                          // The in-process `AppModule` composes the deposit module, so it
                          // needs the same four merchant values the API HTTP process got.
                          ...merchantBankEnv(merchant),
                          // APP12-S03 only, and all three for reasons S02 does not have:
                          //
                          // - the Admin origin and credentials, because the customer's
                          //   screen only moves when an operator writes, and the run has
                          //   to log in as one through the real form;
                          // - this run's object storage, because the evidence journey
                          //   uploads a real image and the in-process worker inspects it.
                          //
                          // The password travels the child environment only — never an
                          // argument, never a log line.
                          ...(app12S03 || app12A02 || app12H01 || app12H08 || app12V01
                            ? {
                                E2E_BASE_ADMIN: config.baseUrls.admin,
                                E2E_ADMIN_EMAIL: adminCredentials.email,
                                E2E_ADMIN_PASSWORD: adminCredentials.password,
                                ...objectStorageEnv(config.storage),
                              }
                            : {}),
                          // APP12-V01 only: the density fixture's own slugs, plus the
                          // Storefront origin the public tour navigates. Every value is
                          // a public catalog slug — nothing secret travels here.
                          ...(app12V01
                            ? {
                                E2E_BASE_STOREFRONT: config.baseUrls.storefront,
                                E2E_APP12_V01_CATEGORIES: app12V01Fixture.categorySlugs.join(','),
                                E2E_APP12_V01_PRODUCTS: app12V01Fixture.productSlugs.join(','),
                                E2E_APP12_V01_GALLERY: app12V01Fixture.gallerySlugs.join(','),
                                E2E_APP12_V01_IN_STOCK: app12V01Fixture.inStockSlug,
                                E2E_APP12_V01_OUT_OF_STOCK: app12V01Fixture.outOfStockSlug,
                                E2E_APP12_V01_MULTI_VARIANT: app12V01Fixture.multiVariantSlug,
                              }
                            : {}),
                        }
                      : {};
    exitCode =
      runner === 'container'
        ? await runContainer({
            packageRoot: config.packageRoot,
            projects,
            config,
            projectName: env.projectName,
          })
        : await runHost({
            packageRoot: config.packageRoot,
            projects,
            baseUrls: config.baseUrls,
            extraArgs,
            env: browserEnv,
          });
    log(`playwright exited with code ${exitCode}`);
  } catch (error) {
    log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  } finally {
    await cleanupOnce();
  }
  process.exit(exitCode ?? 1);
}

main().catch((error) => {
  process.stderr.write(`[e2e] fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
