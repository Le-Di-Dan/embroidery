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

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const runnerArg = argv.find((a) => a.startsWith('--runner='));
  const app1 = flags.has('--app1');
  // APP4-E01-H01: a non-Playwright mode, so it short-circuits before projects.
  const app4 = flags.has('--app4') && !flags.has('--app4-browser');
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
  // APP4-E01-H02: the browser tier, which IS a Playwright mode.
  const app4Browser =
    flags.has('--app4-browser') || app4R01 || app4R01C1 || app5E01 || app7E01;
  const full = flags.has('--full');
  const mode = app4
    ? 'app4'
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
  const projects = app7E01
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
    app1 || app4Browser
      ? 'host'
      : runnerArg
        ? runnerArg.split('=')[1]
        : full
          ? 'container'
          : 'host';
  const extraArgs = [];
  if (flags.has('--headed')) extraArgs.push('--headed');
  if (flags.has('--debug')) extraArgs.push('--debug');
  return { mode, projects, runner, extraArgs, app1, app4, app4Browser, app5E01, app7E01 };
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
  const { mode, projects, runner, extraArgs, app1, app4, app4Browser, app5E01, app7E01 } = parseArgs(
    process.argv.slice(2),
  );
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
  const adminCredentials = app1 || app4Browser ? createAdminCredentials(runId) : undefined;
  // The browser tier overrides one non-secret value: the canonical origin the
  // API renders secure links against. The generated default is an unresolvable
  // `.invalid` host — correct for the lean H01 mode, which never opens a
  // browser, but `APP4-E01-R01` has to *navigate* the delivered link, so here it
  // must be this run's real gateway origin. Still a per-run test value; IMP-D050
  // is untouched.
  const app4Secrets = app4Browser
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
