#!/usr/bin/env node
/**
 * Destroys and recreates the local development database volume.
 *
 * Usage: node tools/db-reset.mjs [--yes]
 *
 * This is the documented remedy for the two states that cannot be repaired in
 * place (ADR-DB1-013):
 *
 * - a volume initialised before the `--locale=C` baseline existed, because
 *   `initdb` runs only once per volume (DEV-DB6-001);
 * - a local database migrated on another branch, so its history is ahead of or
 *   divergent from the current branch.
 *
 * It is destructive and local-only. It refuses to run unless NODE_ENV is a
 * development or test environment, and it prompts unless `--yes` is passed.
 * The development volume is never a source of truth: everything in it is
 * reproducible from migrations plus seeds.
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCKER_DEV = join(REPO_ROOT, 'tools', 'docker-dev.mjs');
const VOLUME = 'embroidery-dev_embroidery_postgres_data';
const PROTECTED_ENVIRONMENTS = ['production', 'staging'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  return result.status ?? 1;
}

async function confirm() {
  if (process.argv.includes('--yes')) {
    return true;
  }
  if (!process.stdin.isTTY) {
    console.error('[db:reset] refusing to run non-interactively without --yes.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[db:reset] This DESTROYS the local volume "${VOLUME}" and all data in it.\n` +
      '[db:reset] Type "reset" to continue: ',
  );
  rl.close();
  return answer.trim() === 'reset';
}

async function main() {
  const environment = process.env.NODE_ENV ?? 'development';
  if (PROTECTED_ENVIRONMENTS.includes(environment)) {
    console.error(`[db:reset] refusing to run with NODE_ENV=${environment}.`);
    process.exitCode = 1;
    return;
  }

  if (!(await confirm())) {
    console.log('[db:reset] aborted; nothing was changed.');
    return;
  }

  console.log('[db:reset] stopping and removing the postgres service...');
  run(process.execPath, [DOCKER_DEV, 'rm', '-sfv', 'postgres']);

  console.log(`[db:reset] removing volume ${VOLUME}...`);
  // A missing volume is not an error: the goal is "no stale volume".
  run('docker', ['volume', 'rm', VOLUME], { stdio: 'ignore' });

  console.log('[db:reset] starting a freshly initialised postgres...');
  const started = run(process.execPath, [DOCKER_DEV, 'up', '-d', 'postgres']);
  if (started !== 0) {
    console.error('[db:reset] failed to start postgres.');
    process.exitCode = started;
    return;
  }

  console.log('[db:reset] done. Next: `pnpm db:migrate` (wait for the healthcheck first).');
}

await main();
