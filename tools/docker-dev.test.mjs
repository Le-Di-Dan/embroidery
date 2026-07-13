/**
 * Verification for tools/docker-dev.mjs argument construction.
 * Run from the repository root:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComposeArgs, parseWrapperArgs } from './docker-dev.mjs';

const COMPOSE_FILE = 'infrastructure/compose/docker-compose.dev.yml';
const ENV_FILE = '.env';

test('places global flags before the subcommand in the required order', () => {
  const args = buildComposeArgs({
    composeFile: COMPOSE_FILE,
    envFile: ENV_FILE,
    profile: 'quality',
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(args, [
    'compose',
    '--env-file',
    ENV_FILE,
    '-f',
    COMPOSE_FILE,
    '--profile',
    'quality',
    'up',
    '-d',
  ]);
});

test('omits --env-file when no .env exists', () => {
  const args = buildComposeArgs({
    composeFile: COMPOSE_FILE,
    envFile: undefined,
    profile: undefined,
    commandArgs: ['config'],
  });
  assert.deepEqual(args, ['compose', '-f', COMPOSE_FILE, 'config']);
});

test('omits --profile for the default stack', () => {
  const args = buildComposeArgs({
    composeFile: COMPOSE_FILE,
    envFile: ENV_FILE,
    profile: undefined,
    commandArgs: ['down'],
  });
  assert.equal(args.includes('--profile'), false);
  assert.equal(args.at(-1), 'down');
});

test('passes extra compose arguments through unchanged', () => {
  const args = buildComposeArgs({
    composeFile: COMPOSE_FILE,
    envFile: undefined,
    profile: undefined,
    commandArgs: ['logs', '--tail', '100', 'api'],
  });
  assert.deepEqual(args.slice(-4), ['logs', '--tail', '100', 'api']);
});

test('parseWrapperArgs extracts the --quality flag from any position', () => {
  assert.deepEqual(parseWrapperArgs(['--quality', 'up', '-d']), {
    quality: true,
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(parseWrapperArgs(['down', '--quality']), {
    quality: true,
    commandArgs: ['down'],
  });
  assert.deepEqual(parseWrapperArgs(['ps']), { quality: false, commandArgs: ['ps'] });
});
