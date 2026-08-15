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
  createRunId,
  loadE2EConfig,
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
  // APP4-E01-H02: the browser tier, which IS a Playwright mode.
  const app4Browser = flags.has('--app4-browser');
  const full = flags.has('--full');
  const mode = app4
    ? 'app4'
    : app4Browser
      ? 'app4-browser'
      : app1
        ? 'app1'
        : full
          ? 'full'
          : 'smoke';
  const projects = app4Browser ? APP4 : app1 ? APP1 : full ? FULL : SMOKE;
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
  return { mode, projects, runner, extraArgs, app1, app4, app4Browser };
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
  const { mode, projects, runner, extraArgs, app1, app4, app4Browser } = parseArgs(
    process.argv.slice(2),
  );
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
  const app4Secrets = app4Browser ? createApp4SecretConfig(runId) : undefined;
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
      ...(app4Secrets === undefined ? {} : { withApp4: app4SecretEnv(app4Secrets) }),
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
              : { E2E_RUN_ID: runId, ...app4SecretEnv(app4Secrets) }),
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
