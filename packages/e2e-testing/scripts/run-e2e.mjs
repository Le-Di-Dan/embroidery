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
import { createRunId, loadE2EConfig } from '../support/orchestration/config.mjs';
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

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const runnerArg = argv.find((a) => a.startsWith('--runner='));
  const full = flags.has('--full');
  const mode = full ? 'full' : 'smoke';
  const projects = full ? FULL : SMOKE;
  const runner = runnerArg ? runnerArg.split('=')[1] : full ? 'container' : 'host';
  const extraArgs = [];
  if (flags.has('--headed')) extraArgs.push('--headed');
  if (flags.has('--debug')) extraArgs.push('--debug');
  return { mode, projects, runner, extraArgs };
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
  const { mode, projects, runner, extraArgs } = parseArgs(process.argv.slice(2));
  const config = loadE2EConfig();
  const runId = createRunId();
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
    env = await startEnvironment({ runId, config, log });
    log(
      `environment ready — storefront ${config.baseUrls.storefront} admin ${config.baseUrls.admin}`,
    );
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
