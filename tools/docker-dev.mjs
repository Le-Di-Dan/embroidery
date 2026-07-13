#!/usr/bin/env node
/**
 * Cross-platform entry point for the development Docker Compose stack.
 *
 * Usage: node tools/docker-dev.mjs [--quality] <compose subcommand> [args...]
 *
 * Resolves the Compose file and the root `.env` from the repository root, so
 * commands work regardless of the caller's working directory and nobody has
 * to remember `--env-file` (the Compose project directory is
 * infrastructure/compose, which would otherwise skip the root `.env`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.dev.yml');
const ENV_FILE = join(REPO_ROOT, '.env');
const QUALITY_FLAG = '--quality';
const QUALITY_PROFILE = 'quality';

/**
 * Pure argument builder (tested in docker-dev.test.mjs).
 * Order matters: global compose flags must precede the subcommand.
 */
export function buildComposeArgs({ composeFile, envFile, profile, commandArgs }) {
  const args = ['compose'];
  if (envFile !== undefined) {
    args.push('--env-file', envFile);
  }
  args.push('-f', composeFile);
  if (profile !== undefined) {
    args.push('--profile', profile);
  }
  return [...args, ...commandArgs];
}

/** Splits our wrapper flags from the raw compose subcommand arguments. */
export function parseWrapperArgs(argv) {
  const quality = argv.includes(QUALITY_FLAG);
  const commandArgs = argv.filter((arg) => arg !== QUALITY_FLAG);
  return { quality, commandArgs };
}

function main() {
  const { quality, commandArgs } = parseWrapperArgs(process.argv.slice(2));
  if (commandArgs.length === 0) {
    console.error('Usage: node tools/docker-dev.mjs [--quality] <compose subcommand> [args...]');
    process.exitCode = 2;
    return;
  }

  const args = buildComposeArgs({
    composeFile: COMPOSE_FILE,
    envFile: existsSync(ENV_FILE) ? ENV_FILE : undefined,
    profile: quality ? QUALITY_PROFILE : undefined,
    commandArgs,
  });

  const result = spawnSync('docker', args, { stdio: 'inherit', cwd: REPO_ROOT });
  if (result.error) {
    console.error(`Failed to run docker: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
