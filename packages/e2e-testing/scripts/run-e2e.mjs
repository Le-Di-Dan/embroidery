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
  createAdminCredentials,
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

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const runnerArg = argv.find((a) => a.startsWith('--runner='));
  const app1 = flags.has('--app1');
  const full = flags.has('--full');
  const mode = app1 ? 'app1' : full ? 'full' : 'smoke';
  const projects = app1 ? APP1 : full ? FULL : SMOKE;
  // The E01 suite is always host/Chromium; it cannot run in the container.
  const runner = app1 ? 'host' : runnerArg ? runnerArg.split('=')[1] : full ? 'container' : 'host';
  const extraArgs = [];
  if (flags.has('--headed')) extraArgs.push('--headed');
  if (flags.has('--debug')) extraArgs.push('--debug');
  return { mode, projects, runner, extraArgs, app1 };
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
  const { mode, projects, runner, extraArgs, app1 } = parseArgs(process.argv.slice(2));
  const config = loadE2EConfig();
  const runId = createRunId();
  const adminCredentials = app1 ? createAdminCredentials(runId) : undefined;
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
    env = await startEnvironment({ runId, config, log, withAdmin: adminCredentials });
    log(
      `environment ready — storefront ${config.baseUrls.storefront} admin ${config.baseUrls.admin}`,
    );
    // E01 specs need the bootstrap Admin credentials and the disposable database
    // URL (for the session-mutation seam); passed only through the child env.
    const app1Env = app1
      ? {
          E2E_ADMIN_EMAIL: adminCredentials.email,
          E2E_ADMIN_PASSWORD: adminCredentials.password,
          E2E_ADMIN_DISPLAY_NAME: adminCredentials.displayName,
          E2E_DATABASE_URL: env.database.url,
          // Loopback control seam for the API-unavailability journey (J02).
          E2E_API_CONTROL_URL: env.apiControlUrl,
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
            env: app1Env,
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
